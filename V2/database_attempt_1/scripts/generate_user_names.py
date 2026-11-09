#!/usr/bin/env python3
"""
Fake names for the synthetic users -- TESTING ONLY. Names are random combinations
and are not tied to any real person. One row per user_id from users.csv.

Run: python3 -I generate_user_names.py --users synthetic_checkins/users.csv --out synthetic_checkins/user_names.csv [--seed 20261103]
"""
import argparse
import csv
import random

FIRST = """Alex Amara Andre Aria Asha Avery Beatriz Ben Blake Bria Caleb Camila Carlos Casey Chloe Cora Dana Daniel Dante
Darius Delia Devon Diego Dominic Elena Eli Elijah Emery Emma Esteban Ethan Eva Ezra Felix Fiona Gabriel Gemma Grace
Hana Hector Hugo Imani Ingrid Isaac Isabel Ivy Jade Jamal Jasmine Jay Jordan Josephine Julian Kai Kamala Keiko Kenji
Kira Laila Lars Leah Leo Liam Lila Lina Logan Luca Lucia Luis Maddox Maia Malik Marco Maria Marcus Maya Micah Mina
Mohammed Naomi Nash Nia Noah Nora Olivia Omar Owen Paloma Parker Penelope Priya Quinn Rafael Rami Reese Remy Riley
Rohan Rosa Rowan Ruby Sage Sam Santiago Sasha Selena Shane Sienna Silas Simone Sofia Stella Tariq Tessa Theo Tomas
Uma Valentina Vera Victor Wesley Willow Xavier Yara Yusuf Zane Zara Zoe""".split()

LAST = """Abara Acosta Adler Ahmed Alvarez Anders Andrade Arora Bailey Banerjee Barnes Bauer Bell Bennett Bianchi Blackwood
Brandt Brooks Bui Burke Cabrera Calloway Campos Carter Castillo Chang Chavez Chen Clarke Cohen Collins Cortez Crawford
Dang Davis Delgado Diaz Dixon Dominguez Donovan Dubois Duncan Edwards Ellis Emerson Evans Farouk Fernandez Fischer
Flores Foster Fox Frost Garcia Gibson Gomez Gonzalez Grant Gray Green Gupta Gutierrez Hale Hamid Hansen Harper Hart
Hassan Hayes Henderson Hernandez Hoang Holt Hughes Hussain Ibrahim Ito Jackson Jain James Jensen Jimenez Johnson Jones
Kaplan Kapoor Kelly Kennedy Khan Kim King Klein Kowalski Kumar Lam Larsen Lee Lewis Li Lin Lopez Lund Mahmoud Malik
Marin Martinez Mason Mendoza Meyer Miller Mitchell Moreno Morgan Morris Murphy Nakamura Nash Nelson Nguyen Nielsen
Novak Nunez Obi Ochoa Okafor Olsen Ortiz Osei Owens Park Patel Perez Peters Pham Porter Powell Price Quinn Ramirez
Ramos Reed Reyes Rhodes Rivera Roberts Robinson Rodriguez Rossi Ruiz Russo Sanchez Santos Sato Schmidt Scott Shah
Silva Singh Smith Soto Stewart Sullivan Tanaka Taylor Thomas Tran Turner Valdez Vargas Vega Wagner Walker Wallace
Walsh Wang Ward Watson White Williams Wilson Wong Wright Yamamoto Young Zhang Zimmerman""".split()

# Small share of users go by a nickname (shows why the app needs a preferred-name field).
NICKNAMES = {'Alexander': 'Xander', 'Daniel': 'Danny', 'Elijah': 'Eli', 'Isabel': 'Izzy', 'Josephine': 'Josie',
             'Mohammed': 'Mo', 'Penelope': 'Penny', 'Valentina': 'Val', 'Santiago': 'Santi', 'Beatriz': 'Bea',
             'Dominic': 'Dom', 'Samuel': 'Sam', 'Isaac': 'Ike', 'Victor': 'Vic', 'Marcus': 'Marc'}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--users', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--seed', type=int, default=20261103)
    args = ap.parse_args()

    with open(args.users, newline='') as f:
        ids = sorted(int(r['user_id']) for r in csv.DictReader(f))

    rng = random.Random(args.seed)
    combos = [(a, b) for a in sorted(set(FIRST)) for b in sorted(set(LAST))]
    rng.shuffle(combos)
    if len(combos) < len(ids):
        raise SystemExit('Not enough unique name combinations')

    with open(args.out, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['user_id', 'first_name', 'last_name', 'full_name', 'preferred_name'])
        for uid, (first, last) in zip(ids, combos):
            preferred = NICKNAMES.get(first, first) if rng.random() < .5 else first
            w.writerow([uid, first, last, f'{first} {last}', preferred])
    print(f'wrote {len(ids)} names to {args.out}')


if __name__ == '__main__':
    main()
