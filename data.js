/* Ride + attraction data for the trip.
   Source: live park listings from the ThemeParks.wiki API (fetched 2026-09-07),
   cross-checked against park maps. Lands assigned by hand.
   type: ride | show | walk | play
   tag:  hhn (Halloween Horror Nights, separate ticket)
         oogie (Oogie Boogie Bash, separate ticket)
*/
window.PARKS = [
  { key: "USH", name: "Universal Studios Hollywood", short: "Universal", accent: "#f0a132" },
  { key: "DL",  name: "Disneyland Park",             short: "Disneyland", accent: "#63a4ff" },
  { key: "DCA", name: "Disney California Adventure", short: "California Adventure", accent: "#f2777a" },
];

window.RIDES = [
  /* ---------------- Universal Studios Hollywood ---------------- */
  { id: "u-studio-tour",   p: "USH", land: "Upper Lot", n: "Studio Tour", type: "ride" },
  { id: "u-hp-journey",    p: "USH", land: "Wizarding World", n: "Harry Potter and the Forbidden Journey", type: "ride" },
  { id: "u-hippogriff",    p: "USH", land: "Wizarding World", n: "Flight of the Hippogriff", type: "ride" },
  { id: "u-ollivanders",   p: "USH", land: "Wizarding World", n: "Ollivanders Wand Experience", type: "walk" },
  { id: "u-triwizard",     p: "USH", land: "Wizarding World", n: "Triwizard Spirit Rally", type: "show" },
  { id: "u-minion",        p: "USH", land: "Upper Lot", n: "Despicable Me Minion Mayhem", type: "ride" },
  { id: "u-silly-swirly",  p: "USH", land: "Upper Lot", n: "Silly Swirly", type: "ride" },
  { id: "u-super-silly",   p: "USH", land: "Upper Lot", n: "Super Silly Fun Land", type: "play" },
  { id: "u-pets",          p: "USH", land: "Upper Lot", n: "The Secret Life of Pets: Off the Leash", type: "ride" },
  { id: "u-simpsons",      p: "USH", land: "Upper Lot", n: "The Simpsons Ride", type: "ride" },
  { id: "u-kungfu",        p: "USH", land: "Upper Lot", n: "Kung Fu Panda Adventure", type: "show" },
  { id: "u-waterworld",    p: "USH", land: "Upper Lot", n: "WaterWorld", type: "show" },
  { id: "u-jurassic",      p: "USH", land: "Lower Lot", n: "Jurassic World – The Ride", type: "ride" },
  { id: "u-dinoplay",      p: "USH", land: "Lower Lot", n: "DinoPlay", type: "play" },
  { id: "u-raptor",        p: "USH", land: "Lower Lot", n: "Raptor Encounter", type: "show" },
  { id: "u-mummy",         p: "USH", land: "Lower Lot", n: "Revenge of the Mummy – The Ride", type: "ride" },
  { id: "u-transformers",  p: "USH", land: "Lower Lot", n: "Transformers: The Ride-3D", type: "ride" },
  { id: "u-ff-drift",      p: "USH", land: "Lower Lot", n: "Fast & Furious: Hollywood Drift", type: "ride", note: "New for 2026" },
  { id: "u-mario-kart",    p: "USH", land: "Super Nintendo World", n: "Mario Kart: Bowser's Challenge", type: "ride" },
  { id: "u-bowser-jr",     p: "USH", land: "Super Nintendo World", n: "Bowser Jr. Challenge", type: "play" },

  { id: "u-hhn-terror-tram", p: "USH", land: "Halloween Horror Nights", n: "Terror Tram: Art the Clown", type: "walk", tag: "hhn" },
  { id: "u-hhn-stranger",    p: "USH", land: "Halloween Horror Nights", n: "Stranger Things 5", type: "walk", tag: "hhn" },
  { id: "u-hhn-evil-dead",   p: "USH", land: "Halloween Horror Nights", n: "Evil Dead Burn", type: "walk", tag: "hhn" },
  { id: "u-hhn-hellraiser",  p: "USH", land: "Halloween Horror Nights", n: "Hellraiser", type: "walk", tag: "hhn" },
  { id: "u-hhn-klowns",      p: "USH", land: "Halloween Horror Nights", n: "Killer Klowns from Outer Space", type: "walk", tag: "hhn" },
  { id: "u-hhn-sinners",     p: "USH", land: "Halloween Horror Nights", n: "Sinners", type: "walk", tag: "hhn" },
  { id: "u-hhn-ozzy",        p: "USH", land: "Halloween Horror Nights", n: "Ozzy Osbourne: Prince of Darkness", type: "walk", tag: "hhn" },
  { id: "u-hhn-dead",        p: "USH", land: "Halloween Horror Nights", n: "Dead Deader Deadest", type: "walk", tag: "hhn" },
  { id: "u-hhn-killcea",     p: "USH", land: "Halloween Horror Nights", n: "Killceañera: Music by SLASH", type: "walk", tag: "hhn" },
  { id: "u-hhn-blood-bog",   p: "USH", land: "Halloween Horror Nights", n: "Blood Bog (scare zone)", type: "walk", tag: "hhn" },
  { id: "u-hhn-circo",       p: "USH", land: "Halloween Horror Nights", n: "El Circo de la Muerte (scare zone)", type: "walk", tag: "hhn" },
  { id: "u-hhn-fortnite",    p: "USH", land: "Halloween Horror Nights", n: "Fortnitemares (scare zone)", type: "walk", tag: "hhn" },
  { id: "u-hhn-hackerz",     p: "USH", land: "Halloween Horror Nights", n: "Hackerz (scare zone)", type: "walk", tag: "hhn" },
  { id: "u-hhn-purge",       p: "USH", land: "Halloween Horror Nights", n: "The Purge: Dangerous Waters (scare zone)", type: "walk", tag: "hhn" },

  /* ---------------- Disneyland Park ---------------- */
  { id: "dl-railroad",     p: "DL", land: "Main Street, U.S.A.", n: "Disneyland Railroad", type: "ride" },
  { id: "dl-main-vehicles",p: "DL", land: "Main Street, U.S.A.", n: "Main Street Vehicles", type: "ride" },
  { id: "dl-magical-life", p: "DL", land: "Main Street, U.S.A.", n: "Walt Disney – A Magical Life", type: "show" },
  { id: "dl-main-cinema",  p: "DL", land: "Main Street, U.S.A.", n: "Main Street Cinema", type: "walk" },
  { id: "dl-gallery",      p: "DL", land: "Main Street, U.S.A.", n: "The Disney Gallery", type: "walk" },

  { id: "dl-jungle",       p: "DL", land: "Adventureland", n: "Jungle Cruise", type: "ride" },
  { id: "dl-indy",         p: "DL", land: "Adventureland", n: "Indiana Jones Adventure", type: "ride" },
  { id: "dl-tiki",         p: "DL", land: "Adventureland", n: "Walt Disney's Enchanted Tiki Room", type: "show" },
  { id: "dl-treehouse",    p: "DL", land: "Adventureland", n: "Adventureland Treehouse", type: "walk" },

  { id: "dl-pirates",      p: "DL", land: "New Orleans Square", n: "Pirates of the Caribbean", type: "ride" },
  { id: "dl-haunted",      p: "DL", land: "New Orleans Square", n: "Haunted Mansion Holiday", type: "ride", note: "Nightmare Before Christmas overlay" },

  { id: "dl-tiana",        p: "DL", land: "Bayou Country", n: "Tiana's Bayou Adventure", type: "ride" },
  { id: "dl-pooh",         p: "DL", land: "Bayou Country", n: "The Many Adventures of Winnie the Pooh", type: "ride" },
  { id: "dl-canoes",       p: "DL", land: "Bayou Country", n: "Davy Crockett's Explorer Canoes", type: "ride" },

  { id: "dl-big-thunder",  p: "DL", land: "Frontierland", n: "Big Thunder Mountain Railroad", type: "ride" },
  { id: "dl-mark-twain",   p: "DL", land: "Frontierland", n: "Mark Twain Riverboat", type: "ride" },
  { id: "dl-columbia",     p: "DL", land: "Frontierland", n: "Sailing Ship Columbia", type: "ride" },
  { id: "dl-tom-sawyer",   p: "DL", land: "Frontierland", n: "Pirate's Lair on Tom Sawyer Island", type: "walk" },
  { id: "dl-shootin",      p: "DL", land: "Frontierland", n: "Frontierland Shootin' Exposition", type: "play" },

  { id: "dl-matterhorn",   p: "DL", land: "Fantasyland", n: "Matterhorn Bobsleds", type: "ride" },
  { id: "dl-small-world",  p: "DL", land: "Fantasyland", n: "it's a small world", type: "ride" },
  { id: "dl-peter-pan",    p: "DL", land: "Fantasyland", n: "Peter Pan's Flight", type: "ride" },
  { id: "dl-snow-white",   p: "DL", land: "Fantasyland", n: "Snow White's Enchanted Wish", type: "ride" },
  { id: "dl-pinocchio",    p: "DL", land: "Fantasyland", n: "Pinocchio's Daring Journey", type: "ride" },
  { id: "dl-mr-toad",      p: "DL", land: "Fantasyland", n: "Mr. Toad's Wild Ride", type: "ride" },
  { id: "dl-alice",        p: "DL", land: "Fantasyland", n: "Alice in Wonderland", type: "ride" },
  { id: "dl-teacups",      p: "DL", land: "Fantasyland", n: "Mad Tea Party", type: "ride" },
  { id: "dl-carrousel",    p: "DL", land: "Fantasyland", n: "King Arthur Carrousel", type: "ride" },
  { id: "dl-dumbo",        p: "DL", land: "Fantasyland", n: "Dumbo the Flying Elephant", type: "ride" },
  { id: "dl-casey-jr",     p: "DL", land: "Fantasyland", n: "Casey Jr. Circus Train", type: "ride" },
  { id: "dl-storybook",    p: "DL", land: "Fantasyland", n: "Storybook Land Canal Boats", type: "ride" },
  { id: "dl-castle-walk",  p: "DL", land: "Fantasyland", n: "Sleeping Beauty Castle Walkthrough", type: "walk" },
  { id: "dl-bluey",        p: "DL", land: "Fantasyland", n: "Bluey's Best Day Ever!", type: "show" },

  { id: "dl-runaway",      p: "DL", land: "Mickey's Toontown", n: "Mickey & Minnie's Runaway Railway", type: "ride" },
  { id: "dl-gadgetcoaster",p: "DL", land: "Mickey's Toontown", n: "Chip 'n' Dale's GADGETcoaster", type: "ride" },
  { id: "dl-roger-rabbit", p: "DL", land: "Mickey's Toontown", n: "Roger Rabbit's Car Toon Spin", type: "ride" },
  { id: "dl-duck-pond",    p: "DL", land: "Mickey's Toontown", n: "Donald's Duck Pond", type: "play" },
  { id: "dl-goofy-yard",   p: "DL", land: "Mickey's Toontown", n: "Goofy's How-to-Play Yard", type: "play" },
  { id: "dl-minnie-house", p: "DL", land: "Mickey's Toontown", n: "Minnie's House", type: "walk" },

  { id: "dl-rise",         p: "DL", land: "Galaxy's Edge", n: "Star Wars: Rise of the Resistance", type: "ride" },
  { id: "dl-falcon",       p: "DL", land: "Galaxy's Edge", n: "Millennium Falcon: Smugglers Run", type: "ride" },
  { id: "dl-shadows",      p: "DL", land: "Galaxy's Edge", n: "Shadows of Memory: A Skywalker Saga", type: "show" },

  { id: "dl-space",        p: "DL", land: "Tomorrowland", n: "Space Mountain", type: "ride" },
  { id: "dl-star-tours",   p: "DL", land: "Tomorrowland", n: "Star Tours – The Adventures Continue", type: "ride" },
  { id: "dl-buzz",         p: "DL", land: "Tomorrowland", n: "Buzz Lightyear Astro Blasters", type: "ride" },
  { id: "dl-nemo",         p: "DL", land: "Tomorrowland", n: "Finding Nemo Submarine Voyage", type: "ride" },
  { id: "dl-autopia",      p: "DL", land: "Tomorrowland", n: "Autopia", type: "ride" },
  { id: "dl-astro-orbitor",p: "DL", land: "Tomorrowland", n: "Astro Orbitor", type: "ride" },
  { id: "dl-monorail",     p: "DL", land: "Tomorrowland", n: "Disneyland Monorail", type: "ride" },

  { id: "dl-fantasmic",    p: "DL", land: "Nighttime", n: "Fantasmic!", type: "show" },
  { id: "dl-halloween-screams", p: "DL", land: "Nighttime", n: "Halloween Screams (fireworks)", type: "show" },
  { id: "dl-paint-night",  p: "DL", land: "Nighttime", n: "Paint the Night", type: "show" },
  { id: "dl-wondrous",     p: "DL", land: "Nighttime", n: "Wondrous Journeys", type: "show" },
  { id: "dl-tapestry",     p: "DL", land: "Nighttime", n: "Tapestry of Happiness", type: "show" },
  { id: "dl-hall-cavalcade",p: "DL", land: "Nighttime", n: "Mickey and Friends Halloween Cavalcade", type: "show" },

  /* ---------------- Disney California Adventure ---------------- */
  { id: "ca-monsters-inc", p: "DCA", land: "Hollywood Land", n: "Monsters, Inc. Mike & Sulley to the Rescue!", type: "ride" },
  { id: "ca-philharmagic", p: "DCA", land: "Hollywood Land", n: "Mickey's PhilharMagic", type: "show" },
  { id: "ca-animation",    p: "DCA", land: "Hollywood Land", n: "Animation Academy", type: "walk" },
  { id: "ca-turtle-talk",  p: "DCA", land: "Hollywood Land", n: "Turtle Talk with Crush", type: "show" },
  { id: "ca-sorcerers",    p: "DCA", land: "Hollywood Land", n: "Sorcerer's Workshop", type: "walk" },

  { id: "ca-guardians",    p: "DCA", land: "Avengers Campus", n: "Guardians of the Galaxy – Mission: BREAKOUT!", type: "ride" },
  { id: "ca-web-slingers", p: "DCA", land: "Avengers Campus", n: "WEB SLINGERS: A Spider-Man Adventure", type: "ride" },
  { id: "ca-spiderman",    p: "DCA", land: "Avengers Campus", n: "The Amazing Spider-Man!", type: "show" },

  { id: "ca-grizzly",      p: "DCA", land: "Grizzly Peak", n: "Grizzly River Run", type: "ride" },
  { id: "ca-soarin",       p: "DCA", land: "Grizzly Peak", n: "Soarin' Across America", type: "ride" },
  { id: "ca-redwood",      p: "DCA", land: "Grizzly Peak", n: "Redwood Creek Challenge Trail", type: "play" },

  { id: "ca-bakery",       p: "DCA", land: "San Fransokyo Square", n: "The Bakery Tour", type: "walk" },

  { id: "ca-racers",       p: "DCA", land: "Cars Land", n: "Radiator Springs Racers", type: "ride" },
  { id: "ca-luigi",        p: "DCA", land: "Cars Land", n: "Luigi's Honkin' Haul-O-Ween", type: "ride", note: "Halloween overlay of Rollickin' Roadsters" },
  { id: "ca-mater",        p: "DCA", land: "Cars Land", n: "Mater's Graveyard JamBOOree", type: "ride", note: "Halloween overlay of Junkyard Jamboree" },

  { id: "ca-incredicoaster",p:"DCA", land: "Pixar Pier", n: "Incredicoaster", type: "ride" },
  { id: "ca-toy-story",    p: "DCA", land: "Pixar Pier", n: "Toy Story Midway Mania!", type: "ride" },
  { id: "ca-pal-swing",    p: "DCA", land: "Pixar Pier", n: "Pixar Pal-A-Round – Swinging", type: "ride" },
  { id: "ca-pal-still",    p: "DCA", land: "Pixar Pier", n: "Pixar Pal-A-Round – Non-Swinging", type: "ride" },
  { id: "ca-inside-out",   p: "DCA", land: "Pixar Pier", n: "Inside Out Emotional Whirlwind", type: "ride" },
  { id: "ca-jessie",       p: "DCA", land: "Pixar Pier", n: "Jessie's Critter Carousel", type: "ride" },
  { id: "ca-midway-games", p: "DCA", land: "Pixar Pier", n: "Games of Pixar Pier", type: "play" },

  { id: "ca-little-mermaid",p:"DCA", land: "Paradise Gardens", n: "The Little Mermaid – Ariel's Undersea Adventure", type: "ride" },
  { id: "ca-golden-zephyr",p: "DCA", land: "Paradise Gardens", n: "Golden Zephyr", type: "ride" },
  { id: "ca-silly-swings", p: "DCA", land: "Paradise Gardens", n: "Silly Symphony Swings", type: "ride" },
  { id: "ca-goofy-sky",    p: "DCA", land: "Paradise Gardens", n: "Goofy's Sky School", type: "ride" },
  { id: "ca-jellyfish",    p: "DCA", land: "Paradise Gardens", n: "Jumpin' Jellyfish", type: "ride" },

  { id: "ca-world-of-color",p:"DCA", land: "Nighttime", n: "World of Color – ONE", type: "show" },
  { id: "ca-woc-happiness",p: "DCA", land: "Nighttime", n: "World of Color Happiness!", type: "show" },
  { id: "ca-dance-off",    p: "DCA", land: "Nighttime", n: "Guardians of the Galaxy: Awesome Dance Off!", type: "show" },
  { id: "ca-five-dime",    p: "DCA", land: "Nighttime", n: "Five & Dime", type: "show" },
  { id: "ca-green-army",   p: "DCA", land: "Nighttime", n: "Operation: Playtime! (Green Army Patrol)", type: "show" },

  { id: "ca-oogie-monsters",p:"DCA", land: "Oogie Boogie Bash", n: "Guardians of the Galaxy – Monsters After Dark", type: "ride", tag: "oogie" },
  { id: "ca-oogie-treats", p: "DCA", land: "Oogie Boogie Bash", n: "Treat Trails", type: "walk", tag: "oogie" },
  { id: "ca-oogie-grove",  p: "DCA", land: "Oogie Boogie Bash", n: "Villains Grove", type: "walk", tag: "oogie" },
  { id: "ca-oogie-leota",  p: "DCA", land: "Oogie Boogie Bash", n: "Madame Leota's Swinging Wake", type: "show", tag: "oogie" },
];

/* ---------------- Trip flags — 18–20 September 2026 ----------------
   Set for this specific trip: Universal Fri 18 (2pm entry + HHN after dark),
   California Adventure Sat 19, Disneyland Sun 20.

   must   – don't leave the park without it
   skip   – fine to walk past: long wait, short payoff, or a near-clone
   closed – not operating on the trip dates
   day    – Universal only: gone when the day park shuts at 6pm
   hhn    – Universal only: still running during Halloween Horror Nights

   Universal's day/hhn split is from Inside Universal's HHN 2026 guide and
   halloweenhorrornights.net (both fetched 2026-09-07). Jurassic World is
   closed during HHN this year — a change from previous years.
*/
window.FLAGS = {
  must:   { label: "Must do",  cls: "f-must" },
  skip:   { label: "Skip",     cls: "f-skip" },
  closed: { label: "Closed",   cls: "f-closed" },
  day:    { label: "Day only", cls: "f-day" },
  hhn:    { label: "Open at HHN", cls: "f-hhn" },
};

window.TRIP_FLAGS = {
  /* -------- Universal: after 6pm only the HHN list keeps running -------- */
  "u-studio-tour":  { f: ["must", "day"], n: "Becomes the Terror Tram after dark — ride it first" },
  "u-waterworld":   { f: ["must", "day"], n: "Check the last showtime when you scan in" },
  "u-jurassic":     { f: ["must", "day"], n: "Closed during HHN this year — daylight or never" },
  "u-ff-drift":     { f: ["must", "day"], n: "At night it's R.I.P. Tour only" },
  "u-minion":       { f: ["skip", "day"], n: "Same sim as The Simpsons — do that one at night instead" },
  "u-silly-swirly": { f: ["skip", "day"] },
  "u-super-silly":  { f: ["skip", "day"] },
  "u-dinoplay":     { f: ["skip", "day"] },
  "u-pets":         { f: ["day"] },
  "u-kungfu":       { f: ["day"] },
  "u-raptor":       { f: ["day"] },
  "u-ollivanders":  { f: ["day"] },
  "u-triwizard":    { f: ["day"] },

  "u-mummy":        { f: ["must", "hhn"], n: "Save it for the event — walk-on late with Express" },
  "u-mario-kart":   { f: ["must", "hhn"], n: "Nintendo World is open 7–10pm; the ride shuts ~9pm" },
  "u-transformers": { f: ["hhn"] },
  "u-simpsons":     { f: ["hhn"] },
  "u-hp-journey":   { f: ["hhn"], n: "Runs until 11:15pm during HHN" },
  "u-hippogriff":   { f: ["skip", "hhn"], n: "45 seconds long" },
  "u-bowser-jr":    { f: ["hhn"], n: "Inside Nintendo World, so 7–10pm" },

  /* -------- Disneyland -------- */
  "dl-indy":        { f: ["closed"], n: "Closed from Sept 8, no reopening date announced" },
  "dl-teacups":     { f: ["closed"], n: "Closed from Sept 14" },
  "dl-rise":        { f: ["must"], n: "Usually a paid Single Pass — book at 7:00am sharp" },
  "dl-haunted":     { f: ["must"], n: "Nightmare Before Christmas overlay; 45+ min waits" },
  "dl-pirates":     { f: ["must"] },
  "dl-big-thunder": { f: ["must"] },
  "dl-space":       { f: ["must"] },
  "dl-jungle":      { f: ["must"] },
  "dl-tiana":       { f: ["must"] },
  "dl-runaway":     { f: ["must"] },
  "dl-matterhorn":  { f: ["skip"], n: "Nostalgia, not a ride — it will rattle your spine" },
  "dl-peter-pan":   { f: ["skip"], n: "45 minutes for 90 seconds" },
  "dl-dumbo":       { f: ["skip"], n: "45 minutes for 90 seconds" },
  "dl-autopia":     { f: ["skip"] },
  "dl-buzz":        { f: ["skip"] },
  "dl-astro-orbitor": { f: ["skip"] },
  "dl-casey-jr":    { f: ["skip"] },
  "dl-carrousel":   { f: ["skip"] },
  "dl-gadgetcoaster": { f: ["skip"] },
  "dl-fantasmic":   { n: "Pick one night show — this or the fireworks, not both" },
  "dl-halloween-screams": { n: "Pick one night show — this or Fantasmic, not both" },

  /* -------- California Adventure -------- */
  "ca-racers":      { f: ["must"], n: "Highest wait in the resort — single rider line is your friend" },
  "ca-guardians":   { f: ["must"] },
  "ca-incredicoaster": { f: ["must"] },
  "ca-soarin":      { f: ["must"] },
  "ca-grizzly":     { f: ["must"], n: "Only if it's hot — you will get properly soaked" },
  "ca-little-mermaid": { f: ["skip"] },
  "ca-golden-zephyr": { f: ["skip"] },
  "ca-jellyfish":   { f: ["skip"] },
  "ca-monsters-inc": { f: ["skip"] },
  "ca-goofy-sky":   { f: ["skip"], n: "Rougher than it's worth" },
  "ca-world-of-color": { n: "See it Saturday — DCA shuts at 6pm Sunday for Oogie Boogie" },
};
