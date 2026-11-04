#!/usr/bin/env python3
"""
Synthetic check-in data generator -- TESTING ONLY, contains no real patient data.

Takes the fitness tracker CSV and attaches simulated daily/weekly check-in
answers to it. Everything joins back to the fitness rows on (user_id, date).

Run:  python3 -I generate_synthetic_checkins.py --input fitness_tracker_dataset.csv --outdir out [--seed 20261103]

Outputs (in --outdir):
  question_bank.csv   every question, its domain / period / role / response type / options
  users.csv           per-user enrollment: domains, base tier, provider-added questions, sim_* traits
  checkins.csv        one row per check-in opportunity (completed / partial / skipped)
  responses.csv       one row per answered question
  tier_events.csv     adaptive tier changes (auto-downgrade, upgrade offers)

Design notes
  * Check-ins are only generated on days where the user has fitness data, so every
    response joins to at least one fitness row. (The fitness file has ~1.6 rows per user-day.)
  * Assignment is per user_id (domains, tier, provider questions); answers are per user-day.
  * Answers loosely depend on that day's fitness data (mood, sleep_hours, steps, workout_type)
    plus a per-user "motivation" trait, so reports/dashboards built on top look plausible.
"""
import argparse
import csv
import math
import os
import random
from collections import deque
from datetime import datetime, timedelta
from types import SimpleNamespace

import numpy as np
import pandas as pd

# ----------------------------------------------------------------------------
# KNOBS -- change these to change the fake population
# ----------------------------------------------------------------------------
P_SUBSTANCE_USER = 0.15                       # share of users with the substance-use domain
N_DOMAINS_P = [(1, .45), (2, .35), (3, .20)]  # how many domains each user picks
OTHER_DOMAIN_W = {'physical_activity': .28, 'nutrition': .22, 'mindfulness': .17,
                  'sleep': .21, 'social': .12}
TIER_P = {'quick': .30, 'standard': .45, 'extended': .25}   # base tier chosen by the user
P_ACCEPT_UPGRADE = .60                        # chance a user accepts the "try longer check-ins?" offer
P_PROVIDER = {'PV1': .20,                     # provider-added questions (share of eligible users)
              'PV2': .40,                     # eligible: substance-use users
              'PV3': .30,                     # eligible: sleep users
              'PV4': .25}                     # eligible: physical-activity users
DOWNGRADE_MISSED_DAYS = 5                     # all of the last 5 days missed -> quick
UPGRADE_WINDOW, UPGRADE_MIN_DAYS = 7, 6       # >= 6 engaged of last 7 days -> offer upgrade
UPGRADE_COOLDOWN_DAYS = 14

MOOD_EFF = {'Happy': .45, 'Neutral': 0.0, 'Tired': -.30, 'Stressed': -.50}
MOOD_CONF = {'Happy': .8, 'Neutral': 0.0, 'Tired': -.7, 'Stressed': -1.2}
MOOD_SKIP = {'Happy': 0.0, 'Neutral': 0.0, 'Tired': .08, 'Stressed': .12}


def sigmoid(x):
    return 1 / (1 + math.exp(-x))


def clip(x, lo, hi):
    return max(lo, min(hi, x))


# ----------------------------------------------------------------------------
# ANSWER GENERATORS
# ----------------------------------------------------------------------------
def T(pool):
    g = lambda c: (c.r.choice(pool), None)
    return g


def C(opts, w=None):
    def g(c):
        return c.r.choices(opts, weights=w(c) if w else None)[0], None
    g.opts = opts
    return g


def S(mean_fn, sd=1.6):
    def g(c):
        v = int(clip(round(c.r.gauss(mean_fn(c), sd)), 0, 10))
        return str(v), v
    g.opts = '0-10'
    return g


def Y(p_fn):
    def g(c):
        y = c.r.random() < p_fn(c)
        return ('Yes' if y else 'No'), int(y)
    g.opts = 'Yes|No'
    return g


def TM(lo_min, hi_min):
    def g(c):
        m = c.r.randrange(lo_min, hi_min + 1, 15)
        return f"{m // 60:02d}:{m % 60:02d}", m
    return g


GOALS = {
    'physical_activity': ["Walk 20 minutes after lunch around my neighborhood at 12:30",
                          "Take a 15-minute walk before dinner at the park",
                          "Do a 10-minute stretching video at 7pm in the living room",
                          "Reach 6,000 steps, starting with a walk at 8am"],
    'nutrition': ["Add vegetables to lunch and dinner at home",
                  "Drink water instead of soda at every meal",
                  "Include protein with breakfast at 8am",
                  "Pack a fruit snack for my afternoon shift"],
    'mindfulness': ["Do a 5-minute breathing exercise at 8pm in my bedroom",
                    "Try a 3-minute guided meditation after lunch at my desk",
                    "Take a 10-minute mindful walk after work"],
    'sleep': ["Start winding down at 9:30pm and be in bed by 10:15pm",
              "Put my phone in another room at 10pm",
              "Set a wind-down reminder for 9pm and dim the lights"],
    'social': ["Text my sister after work at 5pm",
               "Call a friend during my lunch break",
               "Have dinner with a family member tonight"],
    'substance_use': ["Stay within my plan today and call my support person at 6pm",
                      "Avoid the places I usually use and go to the gym at 5pm",
                      "Use my coping list if an urge comes up and text a friend in the evening"],
}

GEN = {}   # question_id -> generator(ctx) -> (value_str, numeric_or_None)
BANK = []  # (id, domain, period, role, source, rtype, text)


def Q(qid, domain, period, role, text, gen, rtype, source='core'):
    BANK.append((qid, domain, period, role, source, rtype, text))
    GEN[qid] = gen


def goal_met_p(c):  # probability helper used by several evening questions
    return c.goal_p


# ---- General ---------------------------------------------------------------
def g_gm1(c):
    return c.r.choice(GOALS[c.goal]), None


Q('GM1', 'general', 'morning', 'primary',
  "What is one specific, measurable thing I will do today to work toward my goal, and when and where will I do it?", g_gm1, 'text')
Q('GM2', 'general', 'morning', 'followup', "What is one small action I can take today that moves me toward my goal?",
  T(["Lay out my shoes the night before", "Set a phone reminder for the afternoon", "Start with just five minutes",
     "Tell someone my plan", "Prep what I need before work"]), 'text')
Q('GM3', 'general', 'morning', 'followup', "Why does this matter to me today?",
  T(["I want to feel more in control of my health", "It helps my mood when I follow through",
     "I want to build a streak", "My provider and I talked about it", "I want more energy for my family"]), 'text')
Q('GM4', 'general', 'morning', 'followup', "What is most likely to get in the way, and what will I do if it happens?",
  T(["Work running late -- I'll do a shorter version", "Low energy -- I'll lower the target",
     "Bad weather -- I'll do it indoors", "Forgetting -- I'll set an alarm", "Stress -- I'll take a short break first"]), 'text')


def g_gm5(c):
    v = int(clip(round(c.r.gauss(6.3 + .8 * c.u.m + MOOD_CONF[c.mood], 1.8)), 0, 10))
    c.conf = v
    return str(v), v


g_gm5.opts = '0-10'
Q('GM5', 'general', 'morning', 'followup', "How confident am I that I can accomplish this goal today (0-10)?", g_gm5, 'scale_0_10')


def g_gm6(c):
    y = c.r.random() < .60
    if y:
        c.goal_p = min(.95, c.goal_p + .15)   # smaller goal is easier to hit
    return ('Yes' if y else 'No'), int(y)


g_gm6.opts = 'Yes|No'
Q('GM6', 'general', 'morning', 'conditional',
  "(Shown if confidence is low) Would I like to adjust today's goal to make it more achievable?", g_gm6, 'yes_no')


def g_ge2(c):
    c.goal_met = c.r.random() < c.goal_p
    return ('Yes' if c.goal_met else 'No'), int(c.goal_met)


g_ge2.opts = 'Yes|No'


# GE1 text depends on whether the goal is met; draw the outcome first, GE2 then reports it.
def g_ge1_real(c):
    c.goal_met_pre = c.r.random() < c.goal_p
    c.goal_p = 1.0 if c.goal_met_pre else 0.0   # make GE2 consistent with what was written
    if c.goal_met_pre:
        return c.r.choice(["Did my planned activity as intended", "Completed it, a little shorter than planned",
                           "Finished my goal after work", "Did it in the morning, felt good"]), None
    return c.r.choice(["Did a smaller version of my plan", "Didn't get to it, the day got away from me",
                       "Got started but stopped early", "Only managed a few minutes"]), None


Q('GE1', 'general', 'evening', 'primary', "What did I do today toward my goal? Briefly write down what I did.", g_ge1_real, 'text')
Q('GE2', 'general', 'evening', 'primary', "Did I meet my goal today? (Yes/No)", g_ge2, 'yes_no')
Q('GE3', 'general', 'evening', 'followup', "What helped me follow through, and what got in the way?",
  lambda c: (c.r.choice(["Having a set time helped", "A reminder on my phone helped", "Support from a friend helped"]
                        if c.goal_met else
                        ["Low energy got in the way", "Work ran long", "Stress made it hard to start"]), None), 'text')
Q('GE4', 'general', 'evening', 'conditional', "(Shown if goal met) How did I feel after completing my goal?",
  C(['Proud', 'Relieved', 'Energized', 'Calm', 'Neutral'],
    lambda c: {'Happy': [.3, .15, .3, .15, .1], 'Neutral': [.2, .2, .15, .2, .25],
               'Tired': [.2, .35, .05, .15, .25], 'Stressed': [.15, .45, .05, .2, .15]}[c.mood]), 'choice')
Q('GE5', 'general', 'evening', 'followup', "What is one thing I can do tomorrow to make following through easier?",
  T(["Prepare my things tonight", "Pick a specific time", "Make the goal a bit smaller", "Ask someone to check in with me",
     "Go to bed earlier", "Do it first thing in the morning"]), 'text')
Q('GE6', 'general', 'evening', 'conditional',
  "(Shown if goal not met) If a friend were in the same situation, what would I say to encourage them? What could I adjust tomorrow?",
  T(["I'd tell them one hard day doesn't undo their progress. Tomorrow I'll start smaller.",
     "I'd say showing up counts. I'll pick an easier time tomorrow.",
     "I'd say be kind to yourself and try again. I'll set a reminder.",
     "I'd remind them they've done it before. I'll shrink the goal to 10 minutes."]), 'text')

# ---- Physical activity ----------------------------------------------------
STEP_TARGETS = list(range(3000, 12001, 500))


def g_pam1(c):
    v = int(clip(round((c.u.step_target + c.r.gauss(0, 500)) / 500) * 500, 2000, 15000))
    return str(v), v


Q('PAM1', 'physical_activity', 'morning', 'primary', "What is my step target today?", g_pam1, 'number')
Q('PAM2', 'physical_activity', 'morning', 'followup',
  "What is one fun activity I can do that will get my body moving for at least 10 minutes?",
  C(['Walk outside', 'Dance to music', 'Stretching video', 'Bike ride', 'Swim', 'Yoga', 'Gym workout']), 'choice')
Q('PAM3', 'physical_activity', 'morning', 'followup', "When and where will I complete my movement goal?",
  T(["After lunch, around the block", "Before work, at the park", "After dinner, in the living room",
     "On my break, around the office", "Late afternoon, at the gym"]), 'text')
Q('PAM4', 'physical_activity', 'morning', 'followup', "What is my backup plan if I haven't reached my movement goal by this evening?",
  C(['10-minute walk', 'Short exercise or stretching video', 'Dance to 2-3 favorite songs',
     'Movement break between activities', 'Lower-intensity activity']), 'choice')


def g_pae1(c):
    if c.goal_met or c.r.random() < .35:
        m = c.r.choice([10, 15, 20, 30, 30, 45, 60])
        return f"{c.workout}, {m} minutes", m
    return "Did not get to it today", 0


Q('PAE1', 'physical_activity', 'evening', 'primary', "What physical activity did I complete today? Briefly record what I did and for how long.", g_pae1, 'text')
FEEL = ['Energized', 'Calm', 'Proud', 'Tired', 'Sore', 'No change']
Q('PAE2', 'physical_activity', 'evening', 'followup', "How did I feel afterward?",
  C(FEEL, lambda c: {'Happy': [.3, .15, .3, .05, .1, .1], 'Neutral': [.15, .2, .2, .1, .15, .2],
                     'Tired': [.05, .15, .15, .3, .2, .15], 'Stressed': [.1, .3, .15, .15, .1, .2]}[c.mood]), 'choice')
Q('PAE3', 'physical_activity', 'evening', 'followup', "What would I like to try tomorrow?",
  T(["A longer walk", "A new stretching video", "Dancing", "Biking", "Yoga", "The same thing again"]), 'text')
Q('PAW1', 'physical_activity', 'weekly', 'followup', "What type of movement felt most manageable or enjoyable this week?",
  lambda c: (c.wk_workout, None), 'choice')
Q('PAW2', 'physical_activity', 'weekly', 'followup', "How can I build on that activity next week?",
  T(["Add five minutes", "Do it one more day", "Invite a friend", "Try it at a different time", "Keep it the same"]), 'text')

# ---- Nutrition ------------------------------------------------------------
Q('DNM1', 'nutrition', 'morning', 'primary', "What is one specific nutrition goal I want to accomplish today?",
  T(["Add vegetables to two meals", "Drink water instead of sugary beverages", "Include protein with breakfast",
     "Eat a fruit with lunch", "Cook dinner at home"]), 'text')
Q('DNM2', 'nutrition', 'morning', 'followup', "What is one food I could add today to increase my intake of a particular nutrient?",
  C(['Fiber: oats', 'Fiber: beans', 'Protein: eggs', 'Protein: Greek yogurt', 'Magnesium: spinach', 'Magnesium: almonds']), 'choice')
Q('DNM3', 'nutrition', 'morning', 'followup', "What could make this goal difficult, and how can I prepare for it?",
  T(["Busy lunch -- I'll pack something", "No groceries -- I'll shop after work", "Eating out -- I'll check the menu first",
     "Cravings -- I'll keep fruit nearby"]), 'text')
Q('DNE1', 'nutrition', 'evening', 'primary', "What did I eat today? (plate-based log or optional photo log)",
  lambda c: (c.r.choice(["Photo log submitted", "Half veggies, quarter protein, quarter grains",
                         "Mostly protein and grains, few veggies", "Skipped lunch; big dinner",
                         "Balanced plates at lunch and dinner"]), None), 'text')
Q('DNE2', 'nutrition', 'evening', 'followup', "What nutrition choice am I happy with today?",
  T(["Water with meals", "Added a vegetable at dinner", "Protein at breakfast", "Packed lunch", "Smaller portion at dinner"]), 'text')
Q('DNE3', 'nutrition', 'evening', 'followup',
  "If I had difficulty following my plan, what contributed to it? (hunger, stress, convenience, environment)",
  C(['No difficulty', 'Hunger', 'Stress', 'Convenience', 'Environment'],
    lambda c: {'Happy': [.5, .1, .1, .15, .15], 'Neutral': [.35, .15, .15, .15, .2],
               'Tired': [.2, .2, .15, .3, .15], 'Stressed': [.15, .15, .4, .15, .15]}[c.mood]), 'choice')
Q('DNE4', 'nutrition', 'evening', 'followup', "What could I change in my environment or meal plan to make tomorrow easier?",
  T(["Prep vegetables tonight", "Keep healthy snacks visible", "Plan tomorrow's lunch", "Shop for groceries", "Nothing needed"]), 'text')
Q('DNW1', 'nutrition', 'weekly', 'followup', "What small nutrition change was easiest to maintain this week?",
  T(["Drinking more water", "Adding a vegetable at dinner", "Eating breakfast", "Fruit as a snack"]), 'text')
Q('DNW2', 'nutrition', 'weekly', 'followup', "How can I make that change more convenient?",
  T(["Prep on Sundays", "Keep it in my bag", "Buy it in bulk", "Set a reminder"]), 'text')
Q('DNW3', 'nutrition', 'weekly', 'followup', "Is there a nutrient or food group I would like to focus on next week?",
  C(['Fiber', 'Protein', 'Magnesium', 'Vegetables', 'Whole grains', 'Hydration']), 'choice')
Q('DNW4', 'nutrition', 'weekly', 'followup', "Can I find one healthy recipe that fits my schedule?",
  C(['Yes - quick and easy', 'Yes - needs cooking', 'Not yet'], lambda c: [.45, .25, .3]), 'choice')

# ---- Mindfulness ----------------------------------------------------------
def g_mfm1(c):
    m = c.r.choice([1, 3, 5, 5, 10])
    return f"{m} minutes, {c.r.choice(['morning at home', 'lunch at my desk', 'evening in my bedroom'])}", m


Q('MFM1', 'mindfulness', 'morning', 'primary', "When and where will I practice mindfulness today, and for how long?", g_mfm1, 'text')
Q('MFM2', 'mindfulness', 'morning', 'followup', "Would I like to schedule a reminder or add the practice to my calendar?", Y(lambda c: .55), 'yes_no')
Q('MFM3', 'mindfulness', 'morning', 'followup', "Why is practicing mindfulness important to me?",
  T(["It helps me stay calm", "I want to worry less", "It helps me sleep", "It slows my thoughts down", "I want to be more present"]), 'text')
Q('MFM4', 'mindfulness', 'morning', 'followup', "Would I like suggestions for guided meditations, breathing exercises, music, or other mindfulness activities?",
  C(['Guided meditation', 'Breathing exercise', 'Music', 'Mindful walking', 'Body scan', 'Grounding exercise']), 'choice')


def g_mfe1(c):
    if c.r.random() < clip(.35 + .5 * c.goal_p, .2, .9):
        m = c.r.choice([1, 3, 5, 5, 10])
        return f"Yes: {c.r.choice(['breathing exercise', 'guided meditation', 'body scan', 'grounding'])}, {m} minutes", m
    return "No, not today", 0


Q('MFE1', 'mindfulness', 'evening', 'primary', "Did I practice mindfulness today? If so, what did I do and for how long?", g_mfe1, 'text')
Q('MFE2', 'mindfulness', 'evening', 'followup', "Did I notice any moments when I was functioning on autopilot or experiencing rumination?",
  Y(lambda c: {'Happy': .3, 'Neutral': .45, 'Tired': .6, 'Stressed': .75}[c.mood]), 'yes_no')
Q('MFE3', 'mindfulness', 'evening', 'followup', "How calm or alert do I feel right now on a scale of 0-10?",
  S(lambda c: {'Happy': 7.2, 'Neutral': 6.0, 'Tired': 4.5, 'Stressed': 4.0}[c.mood]), 'scale_0_10')
Q('MFE4', 'mindfulness', 'evening', 'followup', "Was there a moment today when mindfulness helped me respond differently to stress?",
  T(["Yes -- paused before replying in a meeting", "Yes -- took three slow breaths in traffic",
     "Not today", "Noticed tension and relaxed my shoulders"]), 'text')
Q('MFW1', 'mindfulness', 'weekly', 'followup', "Which mindfulness practice helped me feel more present?",
  C(['Guided meditation', 'Breathing exercise', 'Mindful walking', 'Body scan', 'Grounding exercise']), 'choice')
Q('MFW2', 'mindfulness', 'weekly', 'followup', "When would it be easiest to repeat that practice?",
  T(["Right after waking", "On my lunch break", "Before bed", "After work"]), 'text')
Q('MFW3', 'mindfulness', 'weekly', 'followup', "Are there other forms of mindfulness or meditation I would like to explore?",
  C(['Guided meditation', 'Breathing exercises', 'Mindful walking', 'Body scans', 'Brief grounding exercises', 'None right now']), 'choice')

# ---- Sleep ----------------------------------------------------------------
Q('SLM1', 'sleep', 'morning', 'primary', "What time do I want to begin winding down tonight?", TM(20 * 60, 22 * 60 + 15), 'time')


def g_slm2(c):
    m = c.r.randrange(21 * 60 + 15, 24 * 60, 15)
    return f"{m // 60:02d}:{m % 60:02d}", m


Q('SLM2', 'sleep', 'morning', 'followup', "What time do I plan to get into bed?", g_slm2, 'time')
Q('SLM3', 'sleep', 'morning', 'followup', "What is one thing I can do today to support my sleep tonight?",
  C(['No caffeine after 2pm', 'Dim screens early', 'Same wake time', 'Wind-down reminder', 'Short walk today', 'Put phone away']), 'choice')
Q('SLE1', 'sleep', 'evening', 'primary', "Am I putting off going to bed?",
  Y(lambda c: clip(.55 - .06 * (c.sleep - 6.5), .15, .8)), 'yes_no')
Q('SLE1B', 'sleep', 'evening', 'conditional', "(Shown if putting off bed) What is keeping me awake?",
  C(['Scrolling on my phone', 'Stress or worry', 'Not tired', 'TV or streaming', 'Work or school'],
    lambda c: [.35, .3 if c.mood == 'Stressed' else .15, .1, .2, .15]), 'choice')
Q('SLE2', 'sleep', 'evening', 'followup', "Is there anything on my mind that I could write down and set aside for tomorrow?",
  Y(lambda c: {'Happy': .3, 'Neutral': .4, 'Tired': .45, 'Stressed': .7}[c.mood]), 'yes_no')
Q('SLE3', 'sleep', 'evening', 'followup', "Did my previous bedtime routine seem to help me sleep?",
  Y(lambda c: sigmoid(.7 * (c.sleep - 6.5))), 'yes_no')
Q('SLE4', 'sleep', 'evening', 'followup', "What is one thing I can do right now to help myself wind down?",
  C(['Dim the lights', 'Put my phone away', 'Stretch', 'Breathing exercise', 'Read', 'Warm shower']), 'choice')
Q('SLW1', 'sleep', 'weekly', 'followup', "What patterns have I noticed between my daily habits and how rested I feel?",
  T(["I sleep better on days I move more", "Late caffeine hurts my sleep", "Screens at night keep me up",
     "Regular wake time helps", "Haven't noticed a pattern yet"]), 'text')
Q('SLW2', 'sleep', 'weekly', 'followup', "Which parts of my bedtime routine seem to be most helpful?",
  C(['Wind-down reminder', 'Dim screens', 'Reading', 'Stretching', 'Fixed bedtime']), 'choice')
Q('SLW3', 'sleep', 'weekly', 'followup', "Is there one small change I could make to improve my sleep routine next week?",
  C(['Earlier wind-down', 'Phone out of bedroom', 'Same wake time every day', 'Less caffeine', 'App limits at night']), 'choice')

# ---- Social ---------------------------------------------------------------
Q('SCM1', 'social', 'morning', 'primary', "Who is one person I would like to connect with today?",
  C(['Family member', 'Friend', 'Partner', 'Coworker or classmate', 'Peer from support group', 'Neighbor']), 'choice')
Q('SCM2', 'social', 'morning', 'followup', "How would I like to connect with them?",
  C(['Text', 'Phone call', 'Face-to-face', 'Letter'], lambda c: [.4, .3, .25, .05]), 'choice')
Q('SCM3', 'social', 'morning', 'followup', "What is one small action I could take today to strengthen a relationship?",
  T(["Send a thank-you message", "Ask how their week is going", "Share a photo", "Plan a short coffee", "Return a call"]), 'text')
Q('SCE1', 'social', 'evening', 'primary', "Did I connect with someone I feel close to today?",
  Y(lambda c: clip(.35 + .35 * c.goal_p + (.1 if c.mood == 'Happy' else -.1 if c.mood == 'Stressed' else 0), .1, .9)), 'yes_no')
Q('SCE2', 'social', 'evening', 'followup', "Did I feel supported, connected, lonely, or isolated?",
  C(['Supported', 'Connected', 'Lonely', 'Isolated'],
    lambda c: {'Happy': [.4, .4, .1, .1], 'Neutral': [.3, .3, .25, .15],
               'Tired': [.2, .25, .3, .25], 'Stressed': [.2, .2, .3, .3]}[c.mood]), 'choice')
Q('SCE3', 'social', 'evening', 'followup', "Did my interactions today feel supportive or draining?",
  C(['Supportive', 'Draining', 'Mixed'], lambda c: {'Happy': [.7, .1, .2], 'Neutral': [.5, .2, .3],
                                                       'Tired': [.35, .35, .3], 'Stressed': [.3, .4, .3]}[c.mood]), 'choice')
Q('SCE4', 'social', 'evening', 'followup', "Did I avoid social contact today?",
  Y(lambda c: {'Happy': .15, 'Neutral': .25, 'Tired': .4, 'Stressed': .45}[c.mood]), 'yes_no')
Q('SCE4B', 'social', 'evening', 'conditional', "(Shown if avoided contact) What thoughts or feelings contributed to that decision?",
  T(["Too tired", "Felt anxious about talking", "Didn't want to burden anyone", "Low mood", "Busy day"]), 'text')
Q('SCW1', 'social', 'weekly', 'followup', "Which relationships help me feel supported?",
  C(['Family', 'Friends', 'Partner', 'Support group', 'Coworkers']), 'choice')
Q('SCW2', 'social', 'weekly', 'followup', "What is one way I could strengthen those connections?",
  T(["Schedule a weekly call", "Plan a meal together", "Send more check-in texts", "Join a group activity"]), 'text')
Q('SCW3', 'social', 'weekly', 'followup', "Is there someone I would like to reconnect with or spend more time with?",
  T(["An old friend", "My sister", "A former coworker", "My cousin", "A neighbor", "Not right now"]), 'text')

# ---- Substance use --------------------------------------------------------
Q('SUM1', 'substance_use', 'morning', 'primary', "What is my substance-use goal today?",
  C(['Abstain', 'Reduce use', 'Maintain current plan'], lambda c: [.55, .3, .15]), 'choice')
Q('SUM2', 'substance_use', 'morning', 'conditional', "(Shown if reducing) What is my specific limit or plan?",
  lambda c: (lambda n: (f"Max {n} today, none before 6pm", n))(c.r.randint(1, 4)), 'text')
Q('SUM3', 'substance_use', 'morning', 'followup', "Why does making this change matter to me?",
  T(["My health", "My family", "I want to feel in control", "My job", "I want to keep my progress"]), 'text')
Q('SUM4', 'substance_use', 'morning', 'followup', "What triggers am I likely to encounter today?",
  C(['Stress', 'Certain people', 'Certain places', 'Boredom', 'Conflict', 'None expected']), 'choice')
Q('SUM5', 'substance_use', 'morning', 'followup', "What could I do instead if I experience an urge to use?",
  C(['Distraction activity', 'Grounding technique', 'Call a support person', 'Change environment', 'Wait 15 minutes']), 'choice')
Q('SUM6', 'substance_use', 'morning', 'followup', "Who could support me in reaching my goal today?",
  C(['Family member', 'Friend', 'Sponsor or peer', 'Counselor', 'Partner']), 'choice')


def g_sue1(c):
    if c.goal == 'substance_use' and c.goal_met is not None:
        met = c.goal_met
    else:
        met = c.r.random() < clip(c.goal_p - .05, .1, .95)
    c.su_met = met
    return ('Yes' if met else 'No'), int(met)


g_sue1.opts = 'Yes|No'
Q('SUE1', 'substance_use', 'evening', 'primary', "Did I meet my substance-use goal today?", g_sue1, 'yes_no')
Q('SUE2', 'substance_use', 'evening', 'conditional', "(Shown if goal not met) What situations, emotions, or triggers contributed?",
  C(['Stress', 'Certain people', 'Certain places', 'Boredom', 'Conflict', 'Strong craving'],
    lambda c: [.35 if c.mood == 'Stressed' else .2, .15, .15, .15, .1, .15]), 'choice')
Q('SUE3', 'substance_use', 'evening', 'conditional', "(Shown if goal not met) What coping strategy could I try next time?",
  C(['Distraction activity', 'Grounding technique', 'Call a support person', 'Change environment', 'Wait 15 minutes']), 'choice')
Q('SUE4', 'substance_use', 'evening', 'followup', "What did I gain today by following my plan, even if I only made partial progress?",
  T(["A clearer head", "More energy", "Pride in sticking with it", "Better mood", "Time with family", "Less guilt"]), 'text')
Q('SUW1', 'substance_use', 'weekly', 'followup', "What situations increased my risk of using this week?",
  C(['Stressful days', 'Being around certain people', 'Certain places', 'Boredom or free time', 'Conflict', 'No risky situations']), 'choice')
Q('SUW2', 'substance_use', 'weekly', 'followup', "Which coping strategies or supports were most helpful?",
  C(['Distraction activities', 'Grounding techniques', 'Calling a support person', 'Changing environments', 'Peer group']), 'choice')
Q('SUW3', 'substance_use', 'weekly', 'followup', "What is one adjustment I can make to support my goal next week?",
  T(["Plan evenings ahead", "Avoid one high-risk place", "Check in with my support person daily", "Add a morning routine"]), 'text')

# ---- Provider-added example questions (placeholders) -------------------------
Q('PV1', 'provider', 'weekly', 'provider', "How did the strategy we talked about at your last visit work for you?",
  T(["Helped a lot, I'll keep using it", "Tried it a couple of times, not sure yet", "Forgot to use it most days",
     "Worked on low-stress days only"]), 'text', 'provider_example')
Q('PV2', 'provider', 'evening', 'provider', "Rate your cravings today (0-10).",
  S(lambda c: 3.5 + (1.5 if c.mood == 'Stressed' else 0) - (1.2 if c.goal_met else 0) - .4 * c.u.m), 'scale_0_10', 'provider_example')
Q('PV3', 'provider', 'evening', 'provider', "Did you use your wind-down reminder tonight?", Y(lambda c: .55), 'yes_no', 'provider_example')
Q('PV4', 'provider', 'morning', 'provider', "How many minutes do you plan to walk today?",
  lambda c: (lambda n: (str(n), n))(int(clip(round(c.r.gauss(20, 8) / 5) * 5, 5, 60))), 'number', 'provider_example')

QDOM = {b[0]: b[1] for b in BANK}
QORDER = {b[0]: i for i, b in enumerate(BANK)}

# Domain question lists by period (unconditional, non-provider).
DQ = {}
for qid, dom, per, role, src, rt, txt in BANK:
    if dom not in ('general', 'provider') and role in ('primary', 'followup'):
        DQ.setdefault((dom, per), []).append(qid)

GEN_PRIMARY = {'morning': ['GM1'], 'evening': ['GE1', 'GE2']}
GEN_FOLLOW = {'morning': ['GM2', 'GM3', 'GM4', 'GM5'], 'evening': ['GE3', 'GE5']}

# parent -> [(conditional_id, predicate(value, numeric), allowed_on_quick_tier)]
COND = {
    'GM5': [('GM6', lambda v, n: n is not None and n <= 4, False)],
    'GE2': [('GE6', lambda v, n: v == 'No', True), ('GE4', lambda v, n: v == 'Yes', False)],
    'SLE1': [('SLE1B', lambda v, n: v == 'Yes', True)],
    'SCE4': [('SCE4B', lambda v, n: v == 'Yes', True)],
    'SUM1': [('SUM2', lambda v, n: v == 'Reduce use', True)],
    'SUE1': [('SUE2', lambda v, n: v == 'No', True), ('SUE3', lambda v, n: v == 'No', True)],
}


# ----------------------------------------------------------------------------
# USERS
# ----------------------------------------------------------------------------
def wchoice(rng, pairs):
    return rng.choices([p[0] for p in pairs], weights=[p[1] for p in pairs])[0]


def make_user(uid, rng, enrolled_on):
    sub = rng.random() < P_SUBSTANCE_USER
    n = wchoice(rng, N_DOMAINS_P)
    doms = ['substance_use'] if sub else []
    pool = list(OTHER_DOMAIN_W)
    while len(doms) < n:
        d = rng.choices(pool, weights=[OTHER_DOMAIN_W[x] for x in pool])[0]
        pool.remove(d)
        doms.append(d)
    rng.shuffle(doms)
    pq = []
    if sub and rng.random() < P_PROVIDER['PV2']:
        pq.append('PV2')
    if 'sleep' in doms and rng.random() < P_PROVIDER['PV3']:
        pq.append('PV3')
    if 'physical_activity' in doms and rng.random() < P_PROVIDER['PV4']:
        pq.append('PV4')
    if rng.random() < P_PROVIDER['PV1']:
        pq.append('PV1')
    return SimpleNamespace(
        id=uid, doms=doms, goal=doms[0],
        base_tier=wchoice(rng, list(TIER_P.items())),
        a=rng.betavariate(5, 2.2),         # adherence trait
        m=rng.gauss(0, 1),                 # motivation trait
        step_target=rng.choice(STEP_TARGETS),
        pq=pq, enrolled_on=enrolled_on)


# ----------------------------------------------------------------------------
# CHECK-IN QUESTION SELECTION
# ----------------------------------------------------------------------------
def daily_questions(u, c, period, tier, partial):
    r = c.r
    qs = list(GEN_PRIMARY[period])
    if partial or tier == 'quick':
        return qs
    if tier == 'standard':
        fu = GEN_FOLLOW[period]
        qs.append(r.choices(fu, weights=[1, 1, 1, 1.5][:len(fu)] if period == 'morning' else None)[0])
        d = u.goal if r.random() < .6 else r.choice(u.doms)
        qs.append(r.choice(DQ[(d, period)]))
    else:  # extended
        if period == 'morning':
            qs += ['GM5'] + r.sample(['GM2', 'GM3', 'GM4'], 2)
        else:
            qs += ['GE3', 'GE5']
        for d in u.doms:
            ids = DQ[(d, period)]
            qs += sorted(r.sample(ids, min(2, len(ids))), key=QORDER.get)
    return qs


def weekly_questions(u, tier):
    qs = []
    for d in u.doms:
        ids = DQ[(d, 'weekly')]
        qs += ids[:1] if tier == 'quick' else ids[:2] if tier == 'standard' else ids
    return qs


def answer(qs, c, u, partial, tier, period):
    out = []
    for qid in qs:
        v, n = GEN[qid](c)
        out.append((qid, v, n))
        if not partial:
            for cq, pred, ok_quick in COND.get(qid, []):
                if (tier != 'quick' or ok_quick) and pred(v, n):
                    v2, n2 = GEN[cq](c)
                    out.append((cq, v2, n2))
    if not partial:
        for pq in u.pq:
            if BANK[QORDER[pq]][2] == period:
                v, n = GEN[pq](c)
                out.append((pq, v, n))
    return out


# ----------------------------------------------------------------------------
# MAIN
# ----------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--input', required=True)
    ap.add_argument('--outdir', required=True)
    ap.add_argument('--seed', type=int, default=20261103)
    args = ap.parse_args()
    os.makedirs(args.outdir, exist_ok=True)

    raw = pd.read_csv(args.input, parse_dates=['date'])
    raw['wk'] = raw['date'] + pd.to_timedelta(6 - raw['date'].dt.weekday, unit='D')   # week ending Sunday
    day = (raw.groupby(['user_id', 'date'], sort=True)
              .agg(steps=('steps', 'mean'), sleep=('sleep_hours', 'mean'), active=('active_minutes', 'mean'),
                   mood=('mood', 'first'), workout=('workout_type', 'first'), wk=('wk', 'first'))
              .reset_index())
    steps_mu, steps_sd = day['steps'].mean(), day['steps'].std()
    last_date = raw['date'].max()

    wk = (raw.groupby(['user_id', 'wk', 'workout_type']).size().reset_index(name='n')
             .sort_values(['user_id', 'wk', 'n', 'workout_type'], ascending=[True, True, False, True])
             .drop_duplicates(['user_id', 'wk']).set_index(['user_id', 'wk'])['workout_type'].to_dict())
    wk_days = day.groupby(['user_id', 'wk']).agg(nd=('date', 'size'), sl=('sleep', 'mean')).to_dict('index')

    qb_path = os.path.join(args.outdir, 'question_bank.csv')
    with open(qb_path, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['question_id', 'domain', 'period', 'role', 'source', 'response_type', 'options', 'question_text'])
        for qid, dom, per, role, src, rt, txt in BANK:
            opts = getattr(GEN[qid], 'opts', '')
            if isinstance(opts, list):
                opts = '|'.join(opts)
            w.writerow([qid, dom, per, role, src, rt, opts, txt])

    f_users = open(os.path.join(args.outdir, 'users.csv'), 'w', newline='')
    f_chk = open(os.path.join(args.outdir, 'checkins.csv'), 'w', newline='')
    f_res = open(os.path.join(args.outdir, 'responses.csv'), 'w', newline='')
    f_evt = open(os.path.join(args.outdir, 'tier_events.csv'), 'w', newline='')
    wu, wc, wr, we = (csv.writer(x) for x in (f_users, f_chk, f_res, f_evt))
    wu.writerow(['user_id', 'enrolled_on', 'domains', 'goal_domain', 'base_tier', 'provider_questions',
                 'sim_adherence', 'sim_motivation', 'sim_step_target'])
    wc.writerow(['checkin_id', 'user_id', 'date', 'period', 'tier_offered', 'status', 'n_answered', 'submitted_at'])
    wr.writerow(['response_id', 'checkin_id', 'user_id', 'date', 'period', 'domain', 'question_id',
                 'response_value', 'response_numeric'])
    we.writerow(['user_id', 'date', 'event', 'from_tier', 'to_tier', 'reason'])

    cid = rid = 0

    def emit(u, d, period, tier, status, rows, r, c):
        nonlocal cid, rid
        cid += 1
        if status == 'skipped':
            ts = ''
        else:
            if period == 'morning':
                mins = r.randint(6 * 60 + 15, 10 * 60 + 45)
            elif period == 'evening':
                mins = r.randint(18 * 60, 23 * 60 + 15)
            else:
                mins = r.randint(10 * 60, 20 * 60)
            ts = (d + timedelta(minutes=mins)).strftime('%Y-%m-%d %H:%M')
        wc.writerow([cid, u.id, d.strftime('%Y-%m-%d'), period, tier, status, len(rows), ts])
        for qid, v, n in rows:
            rid += 1
            wr.writerow([rid, cid, u.id, d.strftime('%Y-%m-%d'), period, QDOM[qid], qid, v,
                         '' if n is None else n])

    n_users = 0
    for uid, g in day.groupby('user_id', sort=True):
        r = random.Random(f"{args.seed}-{uid}")
        recs = g.to_dict('records')
        u = make_user(uid, r, recs[0]['date'])
        n_users += 1
        wu.writerow([u.id, u.enrolled_on.strftime('%Y-%m-%d'), '|'.join(u.doms), u.goal, u.base_tier,
                     '|'.join(u.pq), round(u.a, 3), round(u.m, 3), u.step_target])

        tier = u.base_tier
        lapse_left = 0
        engaged = deque(maxlen=UPGRADE_WINDOW)     # was there any check-in each opportunity day?
        recent_partial = deque(maxlen=5)           # outcome of last 5 check-ins that happened
        last_offer = None
        prev_wk = None

        def do_weekly(wk_end):
            info = wk_days.get((u.id, wk_end))
            if not info or info['nd'] < 3 or wk_end > last_date:
                return
            decay_w = max(.45, 1 - (wk_end - u.enrolled_on).days * .0004)
            c = SimpleNamespace(r=r, u=u, wk_workout=wk.get((u.id, wk_end), 'Walking'), mood='Neutral',
                                sleep=info['sl'], goal=u.goal, goal_p=.5, goal_met=None)
            if r.random() < u.a * decay_w * .65:
                qs = weekly_questions(u, tier)
                qs_all = qs
                rows = [(q,) + GEN[q](c) for q in qs_all]
                rows += [(q,) + GEN[q](c) for q in u.pq if BANK[QORDER[q]][2] == 'weekly']
                emit(u, wk_end, 'weekly', tier, 'completed', rows, r, c)
            else:
                emit(u, wk_end, 'weekly', tier, 'skipped', [], r, c)

        for rec in recs:
            d = rec['date']
            if prev_wk is not None and rec['wk'] != prev_wk:
                do_weekly(prev_wk)
            prev_wk = rec['wk']

            days_in = (d - u.enrolled_on).days
            decay = max(.45, 1 - days_in * .0004)
            if lapse_left > 0:
                lapse_left -= 1
                lapse = True
            elif r.random() < .008:
                lapse_left = r.randint(3, 14)
                lapse = True
            else:
                lapse = False
            base_p = clip(u.a * decay - MOOD_SKIP[rec['mood']], .02, .97) * (.12 if lapse else 1.0)

            z = (rec['steps'] - steps_mu) / steps_sd
            conf_latent = 6.3 + .8 * u.m + MOOD_CONF[rec['mood']]
            logit = (-.1 + .9 * u.m + MOOD_EFF[rec['mood']] + .12 * clip(rec['sleep'] - 7, -3, 3)
                     + (.35 if u.goal == 'physical_activity' else .1) * clip(z, -2, 2)
                     + .12 * (conf_latent - 6) - (.5 if u.goal == 'substance_use' else 0))
            c = SimpleNamespace(r=r, u=u, mood=rec['mood'], sleep=rec['sleep'], steps=rec['steps'], z=z,
                                workout=rec['workout'], goal=u.goal, goal_p=sigmoid(logit), goal_met=None,
                                goal_met_pre=None, conf=None, su_met=None, wk_workout='Walking')

            day_engaged = False
            for period, p in (('morning', base_p), ('evening', base_p * .85)):
                if r.random() < p:
                    partial = (tier != 'quick' and r.random() < .05 + .35 * (1 - u.a))
                    qs = daily_questions(u, c, period, tier, partial)
                    rows = answer(qs, c, u, partial, tier, period)
                    emit(u, d, period, tier, 'partial' if partial else 'completed', rows, r, c)
                    recent_partial.append(partial)
                    day_engaged = True
                else:
                    emit(u, d, period, tier, 'skipped', [], r, c)
            engaged.append(day_engaged)

            # ---- adaptive tier logic (evaluated at end of day) ----
            if tier != 'quick':
                missed = sum(1 for x in list(engaged)[-5:] if not x)
                if len(engaged) >= 5 and missed >= DOWNGRADE_MISSED_DAYS:
                    we.writerow([u.id, d.strftime('%Y-%m-%d'), 'auto_downgrade', tier, 'quick', 'missed_check_ins'])
                    tier = 'quick'; engaged.clear(); recent_partial.clear()
                elif len(recent_partial) == 5 and all(recent_partial):
                    we.writerow([u.id, d.strftime('%Y-%m-%d'), 'auto_downgrade', tier, 'quick', 'only_first_question_answered'])
                    tier = 'quick'; engaged.clear(); recent_partial.clear()
            elif u.base_tier != 'quick':
                cooled = last_offer is None or (d - last_offer).days >= UPGRADE_COOLDOWN_DAYS
                if len(engaged) == UPGRADE_WINDOW and sum(engaged) >= UPGRADE_MIN_DAYS and cooled:
                    last_offer = d
                    if r.random() < P_ACCEPT_UPGRADE:
                        we.writerow([u.id, d.strftime('%Y-%m-%d'), 'upgrade_offer_accepted', 'quick', u.base_tier, 'consistent_week'])
                        tier = u.base_tier
                    else:
                        we.writerow([u.id, d.strftime('%Y-%m-%d'), 'upgrade_offer_declined', 'quick', 'quick', 'consistent_week'])
                    engaged.clear(); recent_partial.clear()

        if prev_wk is not None:
            do_weekly(prev_wk)

    for f in (f_users, f_chk, f_res, f_evt):
        f.close()
    print(f"users={n_users} checkins={cid} responses={rid}")


if __name__ == '__main__':
    main()
