/* EXAMPLE DATA ONLY. Not loaded by the app. Shows the exact shapes of HK.config and HK.data.
   To preview the screens with it, add <script src="docs/examples/hk-data.sample.js"></script> right after <script src="js/hk-data.js"></script> in a COPY of the page files.
   Dates are fixed around 2026-11-04 so the numbers never change. Remove "now" from the config in real use (null = the real clock). */
Object.assign(HK.config, {
  "providerName": "Dr. Provider",
  "providerEmail": "provider@example.org",
  "now": "2026-11-04T18:30:00",
  "demoLogins": [],
  "demoNote": ""
});
Object.assign(HK.data, {
 "patients": [
  {
   "id": "pat-7f3a",
   "name": "Alex Sample",
   "email": "alex.sample@example.org",
   "state": "active",
   "fav": true,
   "age": 34,
   "pronouns": "they/them",
   "goal": "Walk after dinner",
   "lengthChosen": "standard",
   "lengthNow": "standard",
   "unlocked": [
    "activity",
    "diet",
    "sleep"
   ],
   "series": [
    {
     "d": "2026-09-26",
     "score": 55
    },
    {
     "d": "2026-09-27",
     "score": 69
    },
    {
     "d": "2026-09-28",
     "score": 62
    },
    {
     "d": "2026-09-29",
     "score": 55
    },
    {
     "d": "2026-09-30",
     "score": 69
    },
    {
     "d": "2026-10-01",
     "score": 62
    },
    {
     "d": "2026-10-02",
     "score": 55
    },
    {
     "d": "2026-10-03",
     "score": 69
    },
    {
     "d": "2026-10-04",
     "score": 62
    },
    {
     "d": "2026-10-05",
     "score": 55
    },
    {
     "d": "2026-10-06",
     "score": 69
    },
    {
     "d": "2026-10-07",
     "score": 62
    },
    {
     "d": "2026-10-08",
     "score": 55
    },
    {
     "d": "2026-10-09",
     "score": 69
    },
    {
     "d": "2026-10-10",
     "score": 62
    },
    {
     "d": "2026-10-11",
     "score": 55
    },
    {
     "d": "2026-10-12",
     "score": 69
    },
    {
     "d": "2026-10-13",
     "score": 62
    },
    {
     "d": "2026-10-14",
     "score": 55
    },
    {
     "d": "2026-10-15",
     "score": 69
    },
    {
     "d": "2026-10-16",
     "score": 62
    },
    {
     "d": "2026-10-17",
     "score": 55
    },
    {
     "d": "2026-10-18",
     "score": 69
    },
    {
     "d": "2026-10-19",
     "score": 62
    },
    {
     "d": "2026-10-20",
     "score": 55
    },
    {
     "d": "2026-10-21",
     "score": 69
    },
    {
     "d": "2026-10-22",
     "score": 62
    },
    {
     "d": "2026-10-23",
     "score": 55
    },
    {
     "d": "2026-10-24",
     "score": 69
    },
    {
     "d": "2026-10-25",
     "score": 62
    },
    {
     "d": "2026-10-26",
     "score": 55
    },
    {
     "d": "2026-10-27",
     "score": 69
    },
    {
     "d": "2026-10-28",
     "score": 62
    },
    {
     "d": "2026-10-29",
     "score": 55
    },
    {
     "d": "2026-10-30",
     "score": 69
    },
    {
     "d": "2026-10-31",
     "score": 62
    },
    {
     "d": "2026-11-01",
     "score": 55
    },
    {
     "d": "2026-11-02",
     "score": 69
    },
    {
     "d": "2026-11-03",
     "score": 62
    },
    {
     "d": "2026-11-04",
     "score": 55
    }
   ]
  },
  {
   "id": "pat-90bc",
   "name": "Bo Example",
   "email": "bo.example@example.org",
   "state": "active",
   "goal": "Eat breakfast",
   "lengthChosen": "extended",
   "lengthNow": "quick",
   "unlocked": [
    "activity",
    "sleep"
   ],
   "series": [
    {
     "d": "2026-10-06",
     "score": 57
    },
    {
     "d": "2026-10-07",
     "score": null
    },
    {
     "d": "2026-10-08",
     "score": 64
    },
    {
     "d": "2026-10-09",
     "score": 59
    },
    {
     "d": "2026-10-10",
     "score": 54
    },
    {
     "d": "2026-10-11",
     "score": null
    },
    {
     "d": "2026-10-12",
     "score": 61
    },
    {
     "d": "2026-10-13",
     "score": 56
    },
    {
     "d": "2026-10-14",
     "score": 51
    },
    {
     "d": "2026-10-15",
     "score": null
    },
    {
     "d": "2026-10-16",
     "score": 58
    },
    {
     "d": "2026-10-17",
     "score": 53
    },
    {
     "d": "2026-10-18",
     "score": 48
    },
    {
     "d": "2026-10-19",
     "score": null
    },
    {
     "d": "2026-10-20",
     "score": 55
    },
    {
     "d": "2026-10-21",
     "score": 50
    },
    {
     "d": "2026-10-22",
     "score": 62
    },
    {
     "d": "2026-10-23",
     "score": null
    },
    {
     "d": "2026-10-24",
     "score": 52
    },
    {
     "d": "2026-10-25",
     "score": 64
    },
    {
     "d": "2026-10-26",
     "score": 59
    },
    {
     "d": "2026-10-27",
     "score": null
    },
    {
     "d": "2026-10-28",
     "score": 49
    },
    {
     "d": "2026-10-29",
     "score": 61
    },
    {
     "d": "2026-10-30",
     "score": 56
    },
    {
     "d": "2026-10-31",
     "score": null
    },
    {
     "d": "2026-11-01",
     "score": 63
    },
    {
     "d": "2026-11-02",
     "score": 58
    },
    {
     "d": "2026-11-03",
     "score": 53
    },
    {
     "d": "2026-11-04",
     "score": null
    }
   ],
   "lastActiveAt": "2026-11-03T21:15:00"
  },
  {
   "id": "pat-c411",
   "name": "Cy Invited",
   "email": "cy.invited@example.org",
   "state": "invited",
   "invitedOn": "Nov 2",
   "lengthChosen": "extended",
   "unlocked": [
    "activity",
    "sleep",
    "social"
   ]
  }
 ],
 "accounts": {
  "provider@example.org": {
   "pw": "Test1234!",
   "role": "provider",
   "id": null,
   "name": "Dr. Provider"
  },
  "alex.sample@example.org": {
   "pw": "Test1234!",
   "role": "patient",
   "id": "pat-7f3a",
   "name": "Alex Sample"
  }
 },
 "domainScores": {
  "pat-7f3a": {
   "2026-11-04": {
    "activity": 58,
    "diet": 51,
    "sleep": 56
   },
   "2026-11-03": {
    "activity": 65,
    "diet": 58,
    "sleep": 63
   },
   "2026-11-02": {
    "activity": 72,
    "diet": 65,
    "sleep": 70
   },
   "2026-11-01": {
    "activity": 58,
    "diet": 51,
    "sleep": 56
   },
   "2026-10-31": {
    "activity": 65,
    "diet": 58,
    "sleep": 63
   },
   "2026-10-30": {
    "activity": 72,
    "diet": 65,
    "sleep": 70
   },
   "2026-10-29": {
    "activity": 58,
    "diet": 51,
    "sleep": 56
   },
   "2026-10-28": {
    "activity": 65,
    "diet": 58,
    "sleep": 63
   },
   "2026-10-27": {
    "activity": 72,
    "diet": 65,
    "sleep": 70
   },
   "2026-10-26": {
    "activity": 58,
    "diet": 51,
    "sleep": 56
   },
   "2026-10-25": {
    "activity": 65,
    "diet": 58,
    "sleep": 63
   },
   "2026-10-24": {
    "activity": 72,
    "diet": 65,
    "sleep": 70
   },
   "2026-10-23": {
    "activity": 58,
    "diet": 51,
    "sleep": 56
   },
   "2026-10-22": {
    "activity": 65,
    "diet": 58,
    "sleep": 63
   },
   "2026-10-21": {
    "activity": 72,
    "diet": 65,
    "sleep": 70
   },
   "2026-10-20": {
    "activity": 58,
    "diet": 51,
    "sleep": 56
   },
   "2026-10-19": {
    "activity": 65,
    "diet": 58,
    "sleep": 63
   },
   "2026-10-18": {
    "activity": 72,
    "diet": 65,
    "sleep": 70
   },
   "2026-10-17": {
    "activity": 58,
    "diet": 51,
    "sleep": 56
   },
   "2026-10-16": {
    "activity": 65,
    "diet": 58,
    "sleep": 63
   },
   "2026-10-15": {
    "activity": 72,
    "diet": 65,
    "sleep": 70
   },
   "2026-10-14": {
    "activity": 58,
    "diet": 51,
    "sleep": 56
   },
   "2026-10-13": {
    "activity": 65,
    "diet": 58,
    "sleep": 63
   },
   "2026-10-12": {
    "activity": 72,
    "diet": 65,
    "sleep": 70
   },
   "2026-10-11": {
    "activity": 58,
    "diet": 51,
    "sleep": 56
   },
   "2026-10-10": {
    "activity": 65,
    "diet": 58,
    "sleep": 63
   },
   "2026-10-09": {
    "activity": 72,
    "diet": 65,
    "sleep": 70
   },
   "2026-10-08": {
    "activity": 58,
    "diet": 51,
    "sleep": 56
   },
   "2026-10-07": {
    "activity": 65,
    "diet": 58,
    "sleep": 63
   },
   "2026-10-06": {
    "activity": 72,
    "diet": 65,
    "sleep": 70
   },
   "2026-10-05": {
    "activity": 58,
    "diet": 51,
    "sleep": 56
   },
   "2026-10-04": {
    "activity": 65,
    "diet": 58,
    "sleep": 63
   },
   "2026-10-03": {
    "activity": 72,
    "diet": 65,
    "sleep": 70
   },
   "2026-10-02": {
    "activity": 58,
    "diet": 51,
    "sleep": 56
   },
   "2026-10-01": {
    "activity": 65,
    "diet": 58,
    "sleep": 63
   },
   "2026-09-30": {
    "activity": 72,
    "diet": 65,
    "sleep": 70
   },
   "2026-09-29": {
    "activity": 58,
    "diet": 51,
    "sleep": 56
   },
   "2026-09-28": {
    "activity": 65,
    "diet": 58,
    "sleep": 63
   },
   "2026-09-27": {
    "activity": 72,
    "diet": 65,
    "sleep": 70
   },
   "2026-09-26": {
    "activity": 58,
    "diet": 51,
    "sleep": 56
   }
  },
  "pat-90bc": {
   "2026-11-03": {
    "activity": 41,
    "sleep": 53
   },
   "2026-11-02": {
    "activity": 42,
    "sleep": 54
   },
   "2026-11-01": {
    "activity": 43,
    "sleep": 55
   },
   "2026-10-30": {
    "activity": 45,
    "sleep": 57
   },
   "2026-10-29": {
    "activity": 46,
    "sleep": 58
   },
   "2026-10-28": {
    "activity": 47,
    "sleep": 52
   },
   "2026-10-26": {
    "activity": 40,
    "sleep": 54
   },
   "2026-10-25": {
    "activity": 41,
    "sleep": 55
   },
   "2026-10-24": {
    "activity": 42,
    "sleep": 56
   },
   "2026-10-22": {
    "activity": 44,
    "sleep": 58
   },
   "2026-10-21": {
    "activity": 45,
    "sleep": 52
   },
   "2026-10-20": {
    "activity": 46,
    "sleep": 53
   },
   "2026-10-18": {
    "activity": 48,
    "sleep": 55
   },
   "2026-10-17": {
    "activity": 40,
    "sleep": 56
   },
   "2026-10-16": {
    "activity": 41,
    "sleep": 57
   },
   "2026-10-14": {
    "activity": 43,
    "sleep": 52
   },
   "2026-10-13": {
    "activity": 44,
    "sleep": 53
   },
   "2026-10-12": {
    "activity": 45,
    "sleep": 54
   },
   "2026-10-10": {
    "activity": 47,
    "sleep": 56
   },
   "2026-10-09": {
    "activity": 48,
    "sleep": 57
   },
   "2026-10-08": {
    "activity": 40,
    "sleep": 58
   },
   "2026-10-06": {
    "activity": 42,
    "sleep": 53
   }
  }
 },
 "events": {
  "pat-7f3a": {
   "2026-11-04": [
    [
     6.7,
     "Woke up",
     null
    ],
    [
     8.1,
     "Morning check-in",
     "am"
    ],
    [
     12.6,
     "Movement logged",
     "activity"
    ]
   ]
  }
 },
 "answers": {
  "pat-7f3a": [
   {
    "d": "2026-11-04",
    "when": "Morning",
    "dom": "activity",
    "txt": "Walked to the park.",
    "barrier": null
   },
   {
    "d": "2026-11-03",
    "when": "Evening",
    "dom": "sleep",
    "txt": "In bed by ten.",
    "barrier": "Low energy"
   }
  ]
 },
 "week": {
  "pat-7f3a": {
   "barriers": [
    [
     "Low energy",
     3
    ],
    [
     "Forgot",
     1
    ]
   ],
   "conf": 7.4,
   "pconf": 6.9,
   "checkins": 11
  }
 },
 "customResults": {
  "pat-7f3a": {
   "q-1": "Yes 5, No 2"
  }
 },
 "privateGoals": {
  "pat-7f3a": [
   {
    "id": "g1",
    "title": "Read before bed",
    "type": "yesno",
    "unit": "times",
    "limit": 0,
    "shared": true,
    "log": {
     "2026-11-03": 1,
     "2026-11-04": 0
    }
   },
   {
    "id": "g2",
    "title": "Hidden private goal",
    "type": "count",
    "unit": "drinks",
    "limit": 2,
    "shared": false,
    "log": {}
   }
  ]
 },
 "customQuestions": {
  "pat-7f3a": [
   {
    "id": "q-1",
    "dom": "activity",
    "when": "pm",
    "type": "yesno",
    "text": "Did you take the evening walk?"
   }
  ]
 },
 "notes": {
  "pat-7f3a": "Ask about the weekend routine."
 },
 "today": {
  "pat-7f3a": {
   "amDone": true,
   "amTime": "7:05 AM",
   "pmDone": false
  }
 }
});
