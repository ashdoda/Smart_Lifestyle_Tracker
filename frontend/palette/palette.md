# Design tokens (generated from css/themes.css)

Fonts: **Bricolage Grotesque** (headings, numbers, `--font-display`) and **Atkinson Hyperlegible Next** (body, `--font-body`). Files in `fonts/`, rules in `css/fonts.css`.

Five themes, switched by the attribute `data-theme` on `<html>`: `sage` (Misty sage), `lavender` (Dusk lavender), `tide` (Calm tide), `oat` (Warm oat), `pine` (Moonlit pine). The default is `sage`. The choice is remembered in the browser (`localStorage` key `hk.theme`).

| token | sage | lavender | tide | oat | pine |
|---|---|---|---|---|---|
| `--bg` | `#c3d0be` | `#d6cde6` | `#c1e1dd` | `#ece3d4` | `#1B2B2E` |
| `--surface` | `#e0e6dd` | `#eae5f2` | `#ddeeec` | `#f6f0e6` | `#233839` |
| `--sunken` | `#bccab7` | `#d2c8e4` | `#badeda` | `#eae0cf` | `#152224` |
| `--line` | `#acbea6` | `#c7bbdd` | `#abd7d2` | `#e5d9c5` | `#2b4442` |
| `--ink` | `#2F3B2E` | `#3A3350` | `#1F3A47` | `#4A3C32` | `#DCE6E3` |
| `--ink2` | `#313731` | `#3b3746` | `#34444c` | `#4e463f` | `#bbc5c3` |
| `--ink3` | `#4c524c` | `#575461` | `#4e5c62` | `#68605b` | `#97a1a1` |
| `--on-accent` | `#fcfdfc` | `#fdfdfe` | `#fcfdfd` | `#fefefd` | `#1B2B2E` |
| `--accent` | `#64755e` | `#776892` | `#507584` | `#7e6d5b` | `#7FA394` |
| `--accent-hover` | `#586753` | `#695c80` | `#466774` | `#6f6050` | `#8eaea1` |
| `--accent-soft` | `#ccd6c7` | `#dcd4ea` | `#c9e5e2` | `#efe7d9` | `#314544` |
| `--accent-ink` | `#465242` | `#584d6c` | `#405e6a` | `#6a5c4c` | `#9eb9ae` |
| `--edge` | `#7d6859` | `#7d6a70` | `#7e7566` | `#9d776b` | `#cfc4a3` |
| `--focus` | `#2F3B2E` | `#3A3350` | `#1F3A47` | `#4A3C32` | `#ffffff` |
| `--good` | `#2d5a3d` | `#2e5e4b` | `#266656` | `#436b40` | `#8FCB9F` |
| `--good-soft` | `#cbd5ca` | `#d3d5de` | `#c7deda` | `#e1e0d2` | `#345049` |
| `--warn` | `#6f4700` | `#764d00` | `#7b5300` | `#885800` | `#E7BB62` |
| `--warn-soft` | `#d2d3c2` | `#dcd3d5` | `#d1dbd0` | `#e9deca` | `#424d40` |
| `--bad` | `#8b332d` | `#903447` | `#9b3c34` | `#a23f35` | `#f2a499` |
| `--bad-soft` | `#d6d1c8` | `#dfd0dd` | `#d5d9d6` | `#ecdbd1` | `#444948` |
| `--chart` | `#5e6e58` | `#776892` | `#507584` | `#7e6d5b` | `#7FA394` |
| `--hill-far` | `#A9BBA2` | `#C5B8DC` | `#A8D5D0` | `#E4D7C3` | `#2F4A47` |
| `--hill-mid` | `#8fa388` | `#a797c3` | `#89bac3` | `#d0bca4` | `#5b7b71` |
| `--hill-near` | `#7A8F73` | `#8E7CAE` | `#6FA3B8` | `#BFA58A` | `#4d6761` |
| `--hill-front` | `#51614d` | `#60547a` | `#43697a` | `#7f6b5a` | `#162225` |
| `--sky` | `#dbe2d7` | `#e6e0ef` | `#d8ebe9` | `#f4ede3` | `#182628` |
| `--sun` | `#C9A88F` | `#E8C4CF` | `#EAD9BC` | `#D4A190` | `#E3D5B0` |
| `--pet-body` | `#C9A88F` | `#E8C4CF` | `#EAD9BC` | `#D4A190` | `#E3D5B0` |
| `--pet-belly` | `#e7d8cd` | `#f5e4e9` | `#f6eee1` | `#ecd5cd` | `#f2ecdb` |
| `--pet-ink` | `#2F3B2E` | `#3A3350` | `#1F3A47` | `#4A3C32` | `#1B2B2E` |
| `--pet-cheek` | `#cf9287` | `#e2a2ad` | `#e3afa2` | `#d68d87` | `#dfad9a` |
| `--scrim` | `rgb(30 40 35 / .38)` | `rgb(30 40 35 / .38)` | `rgb(30 40 35 / .38)` | `rgb(30 40 35 / .38)` | `rgb(0 0 0 / .55)` |
| `--shadow` | `0 10px 36px rgb(47 59 46 / .16)` | `0 10px 36px rgb(58 51 80 / .16)` | `0 10px 36px rgb(31 58 71 / .16)` | `0 10px 36px rgb(74 60 50 / .16)` | `0 10px 36px rgb(0 0 0 / .45)` |
