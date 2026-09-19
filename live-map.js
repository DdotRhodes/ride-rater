/* Ride Rater — live-feed mapping table.

   Two feeds carry live park data, and neither ride name matches this app's own
   catalogue exactly. Rather than fuzzy-match at runtime — where a near miss is
   silent and a must-do quietly loses its wait time — every ride is mapped here
   once, by hand-checked id, and the app reports anything that fails to line up.

   Feeds
   -----
   tp — api.themeparks.wiki, keyed by entity UUID. Reachable straight from the
        browser (Access-Control-Allow-Origin: *). Carries standby waits, single
        rider, Lightning Lane return windows, showtimes, live status and park
        hours for Disneyland and California Adventure. For Universal Hollywood
        it carries status and showtimes but NO wait times at all — verified
        2026-09-08 against a Universal park that does report them (Japan), so
        this is a gap in the Hollywood feed, not in the API.

   qt — queue-times.com, keyed by numeric ride id. Not reachable from a browser:
        it sends no CORS headers whatsoever, so it comes through the sync
        service's /waits route. This is the only source of Universal Hollywood
        wait times, including the Horror Nights houses and their Express lines.

   Fields
   ------
   tp / qt    the id in each feed, or null when that feed genuinely has no row
              for this attraction — reviewed and confirmed, not merely unmatched
   tpn / qtn  the feed's own name at the time of mapping. Kept so the app can
              notice a feed renaming something out from under the id and say so,
              instead of showing a confidently wrong wait.
   qtSingle   Queue-Times files single-rider queues as separate rides. Worth
              having: single rider on Radiator Springs Racers is routinely a
              third of the standby wait. ThemeParks reports the same thing
              inline, so this is a fallback for when only Queue-Times answers.
   qtExpress  Horror Nights houses each have a second Queue-Times row for the
              Express line. The trip includes after-2pm Express, so these are
              the numbers that actually decide the night.

   Coverage, re-verified against both live feeds on 2026-09-07 by verify-map.mjs:
   128 of 128 attractions map to ThemeParks and 105 of 128 also map to
   Queue-Times, with no broken id, no id claimed twice, and nothing flagged
   "must" left without a feed. The ThemeParks-only entries are Universal shows
   and scare zones plus the Disney nighttime spectaculars, none of which
   Queue-Times tracks; those carry status and showtimes rather than a wait,
   which is all they ever have.

   Run `node verify-map.mjs` before a deploy. It re-fetches both feeds, checks
   every id and name in this file against them, and reports what each side is
   carrying that the other is not.
*/
window.LIVE_MAP = {
  parks: {
    USH: { tp: "bc4005c5-8c7e-41d7-b349-cdddf1796427", qt: 66 },
    DL:  { tp: "7340550b-c14d-4def-80bb-acdb51d49a66", qt: 16 },
    DCA: { tp: "832fcd51-ea19-4e77-85c7-75d5843b127c", qt: 17 },
  },

  /* Queue-Times rows this app deliberately does not carry, by feed id and with
     a reason each. Every other row in the feed must map to an attraction, and
     verify-map.mjs fails if one does not — Queue-Times is where the wait times
     come from, so a row falling through here unnoticed is precisely the silent
     drop this design exists to prevent.

     ThemeParks leftovers are not enumerated: that feed also carries restaurants,
     roaming bands and one-off cavalcades whose rows change from day to day, so a
     fixed list would rot into false alarms within a week. They are classified by
     entityType and reported by name instead. */
  ignoredFeedRows: {
    qt: {
      6711:  "meet-and-greet — Meet Disney Princesses at Royal Hall",
      14915: "duplicate row for Walt Disney - A Magical Life (mapped as dl-magical-life via 14923)",
      327:   "duplicate row for Mickey's House (mapped as dl-mickey-house via 709)",
    },
  },

  rides: {
    /* ---------------- Universal Studios Hollywood ---------------- */
    "u-studio-tour":          { tp: "513ae5d3-477d-4d95-82a1-f4ac99678a8d", tpn: "Studio Tour", qt: 6051, qtn: "Studio Tour" },
    "u-hp-journey":           { tp: "9a706e7e-1e52-4603-b170-86c9b8243fc6", tpn: "Harry Potter and the Forbidden Journey™", qt: 6048, qtn: "Harry Potter and the Forbidden Journey™" },
    "u-hippogriff":           { tp: "e7c69919-d73f-4418-9059-5b30495f3af1", tpn: "Flight of the Hippogriff™", qt: 6047, qtn: "Flight of the Hippogriff™" },
    "u-ollivanders":          { tp: "6a04b16b-7d9f-4a92-bcef-b8e17b800a34", tpn: "Ollivanders™", qt: 6056, qtn: "Ollivanders™" },
    "u-triwizard":            { tp: "31733d97-622a-418c-bdf4-04558419f6ab", tpn: "Triwizard Spirit Rally", qt: null, qtn: null },
    "u-minion":               { tp: "9e507da6-9427-4d7f-b315-250a2b2dde97", tpn: "Despicable Me Minion Mayhem", qt: 6045, qtn: "Despicable Me Minion Mayhem" },
    "u-silly-swirly":         { tp: "07e20279-c553-49dc-b6e0-8b4e099e958b", tpn: "Silly Swirly", qt: 14926, qtn: "Silly Swirly" },
    "u-super-silly":          { tp: "bcd47568-15f2-4eab-a406-84ae2d3fa645", tpn: "Super Silly Fun Land", qt: null, qtn: null },
    "u-pets":                 { tp: "cc17465b-4ee2-49ef-b0bc-3065ecae28f7", tpn: "The Secret Life of Pets: Off the Leash", qt: 7332, qtn: "The Secret Life of Pets: Off the Leash" },
    "u-simpsons":             { tp: "225f5fbf-3e7e-4fca-a94a-4a3a747c5103", tpn: "The Simpsons Ride™", qt: 6053, qtn: "The Simpsons Ride™" },
    "u-kungfu":               { tp: "bc53c39c-7d8b-4f28-958d-f3a077d887cd", tpn: "Kung Fu Panda Adventure", qt: 6057, qtn: "Kung Fu Panda Adventure" },
    "u-waterworld":           { tp: "3ee11862-1f2b-4a4f-8abd-9b96bc9e3787", tpn: "WaterWorld", qt: null, qtn: null },
    "u-jurassic":             { tp: "73cc9242-3eea-4a34-8553-9aded86329dc", tpn: "Jurassic World - The Ride", qt: 6049, qtn: "Jurassic World - The Ride" },
    "u-dinoplay":             { tp: "7254c0aa-f0ec-4964-8a44-5c959f786616", tpn: "DinoPlay", qt: 6046, qtn: "DinoPlay" },
    "u-raptor":               { tp: "01b6ad76-93a5-46f2-b3d9-6121ab024326", tpn: "Raptor Encounter", qt: null, qtn: null },
    "u-mummy":                { tp: "8215f2cf-6356-421d-80fa-0e9b26f57bcd", tpn: "Revenge of the Mummy – The Ride", qt: 6050, qtn: "Revenge of the Mummy – The Ride" },
    "u-transformers":         { tp: "2f6f1b8f-d420-4096-8975-fcccfd7fc74c", tpn: "TRANSFORMERS™: The Ride-3D", qt: 6055, qtn: "TRANSFORMERS™: The Ride-3D" },
    "u-ff-drift":             { tp: "c919c895-6108-46ce-b322-8a41db7f7fa3", tpn: "Fast & Furious: Hollywood Drift", qt: 17533, qtn: "Fast & Furious: Hollywood Drift" },
    "u-mario-kart":           { tp: "da1191d8-63b0-45eb-bccf-968b0ea4c5d8", tpn: "Mario Kart™: Bowser’s Challenge", qt: 11513, qtn: "Mario Kart™: Bowser’s Challenge" },
    "u-bowser-jr":            { tp: "28d0765e-5697-4875-8edd-2fc6db1c25be", tpn: "Bowser Jr. Challenge", qt: 17527, qtn: "Bowser Jr. Challenge" },
    "u-hhn-terror-tram":      { tp: "dd9a69bf-dfa4-4c59-a232-04932dbcc390", tpn: "Terror Tram starring Art the Clown", qt: 17605, qtn: "Terror Tram starring Art the Clown" },
    "u-hhn-stranger":         { tp: "b9028d14-4f53-42ae-b66a-802fb91064c4", tpn: "Stranger Things 5", qt: 17600, qtn: "Stranger Things 5", qtExpress: 17594 },
    "u-hhn-evil-dead":        { tp: "d6c8780d-ca58-41a1-b918-37761b9113ee", tpn: "Evil Dead Burn", qt: 17601, qtn: "Evil Dead Burn", qtExpress: 17591 },
    "u-hhn-hellraiser":       { tp: "b10bf063-6412-4091-835d-074c8ef52654", tpn: "Hellraiser", qt: 17602, qtn: "Hellraiser", qtExpress: 17592 },
    "u-hhn-klowns":           { tp: "1b591761-f653-4503-8f15-8d35a0ff6f9a", tpn: "Killer Klowns from Outer Space", qt: 17603, qtn: "Killer Klowns from Outer Space", qtExpress: 17597 },
    "u-hhn-sinners":          { tp: "3950c3fc-dbb8-470c-b0f6-9c90c4d4e393", tpn: "Sinners", qt: 17604, qtn: "Sinners", qtExpress: 17596 },
    "u-hhn-ozzy":             { tp: "cabc118d-ba89-442e-953b-f2767a7cc2d8", tpn: "Ozzy Osbourne: Prince of Darkness", qt: 17599, qtn: "Ozzy Osbourne: Prince of Darkness", qtExpress: 17595 },
    "u-hhn-dead":             { tp: "1047d00d-9995-4b2a-8c53-96c3a3e6f935", tpn: "Dead Deader Deadest", qt: 17606, qtn: "Dead Deader Deadest", qtExpress: 17590 },
    "u-hhn-killcea":          { tp: "e320d6fd-ea6c-4a5b-bab2-a730d060376b", tpn: "Killceañera: Music by SLASH", qt: 17598, qtn: "Killceañera: Music by SLASH", qtExpress: 17593 },
    "u-hhn-blood-bog":        { tp: "2e611294-e0db-4bf0-84c6-ada9abe1e2ac", tpn: "Blood Bog", qt: null, qtn: null },
    "u-hhn-circo":            { tp: "6e60bf25-6158-4e90-a82f-92ef53cd7154", tpn: "El Circo de la Muerte", qt: null, qtn: null },
    "u-hhn-fortnite":         { tp: "e0e96f20-238c-4ddc-a12b-9aaee8bd7e9b", tpn: "FORTNITEMARES", qt: null, qtn: null },
    "u-hhn-hackerz":          { tp: "c7d7d1cf-cfb1-4163-a64d-d3dcfc47b201", tpn: "Hackerz", qt: null, qtn: null },
    "u-hhn-purge":            { tp: "08a054c9-b7dc-405b-88f4-c3425f6d7ed1", tpn: "The Purge: Dangerous Waters", qt: null, qtn: null },

    /* ---------------- Disneyland Park ---------------- */
    "dl-railroad":            { tp: "e2d460e9-2bef-4613-b126-092ab7cb37e5", tpn: "Disneyland Railroad", qt: 674, qtn: "Disneyland Railroad" },
    "dl-main-vehicles":       { tp: "bcfd1e17-3eab-4203-b597-6257a257d427", tpn: "Main Street Vehicles", qt: 691, qtn: "Main Street Vehicles" },
    "dl-magical-life":        { tp: "05b17c11-fd4c-4b85-ab45-3e269dc56559", tpn: "Walt Disney - A Magical Life", qt: 14923, qtn: "Walt Disney - A Magical Life" },
    "dl-main-cinema":         { tp: "f5bb0d14-7eee-4ede-9230-eb256ce3664c", tpn: "Main Street Cinema", qt: 686, qtn: "Main Street Cinema" },
    "dl-gallery":             { tp: "37858b2a-9c11-4ac6-9f8d-db7fa9088703", tpn: "The Disney Gallery", qt: 695, qtn: "The Disney Gallery" },
    "dl-lincoln":             { tp: "1b23667a-d8fb-436d-8952-c3e3f2e56d13", tpn: "Great Moments with Mr. Lincoln", qt: 690, qtn: "Great Moments with Mr. Lincoln" },
    "dl-jungle":              { tp: "1b83fda8-d60e-48e4-9a3d-90ddcbcd1001", tpn: "Jungle Cruise", qt: 296, qtn: "Jungle Cruise" },
    "dl-indy":                { tp: "2aedc657-1ee2-4545-a1ce-14753f28cc66", tpn: "Indiana Jones™ Adventure", qt: 326, qtn: "Indiana Jones™ Adventure" },
    "dl-tiki":                { tp: "106c1e5a-a5e7-42d7-96ab-bc100d8faf71", tpn: "Walt Disney's Enchanted Tiki Room", qt: 288, qtn: "Walt Disney's Enchanted Tiki Room" },
    "dl-treehouse":           { tp: "e27b1db8-9ec9-4f8b-9ca6-fd6377de66ee", tpn: "Adventureland Treehouse inspired by Walt Disney’s Swiss Family Robinson", qt: 12428, qtn: "Adventureland Treehouse inspired by Walt Disney’s Swiss Family Robinson" },
    "dl-pirates":             { tp: "82aeb29b-504a-416f-b13f-f41fa5b766aa", tpn: "Pirates of the Caribbean", qt: 289, qtn: "Pirates of the Caribbean" },
    "dl-haunted":             { tp: "ff52cb64-c1d5-4feb-9d43-5dbd429bac81", tpn: "Haunted Mansion Holiday", qt: 325, qtn: "Haunted Mansion Holiday" },
    "dl-tiana":               { tp: "a9076acd-7630-4bad-a8da-e6bd689ddcac", tpn: "Tiana's Bayou Adventure", qt: 14168, qtn: "Tiana's Bayou Adventure", qtSingle: 14326 },
    "dl-pooh":                { tp: "52a8ef64-d54c-4974-883f-027c3026e3f1", tpn: "The Many Adventures of Winnie the Pooh", qt: 306, qtn: "The Many Adventures of Winnie the Pooh" },
    "dl-canoes":              { tp: "5bd95ae8-181d-449c-8f04-a621e2448961", tpn: "Davy Crockett's Explorer Canoes", qt: 304, qtn: "Davy Crockett's Explorer Canoes" },
    "dl-big-thunder":         { tp: "0de1413a-73ee-46cf-af2e-c491cc7c7d3b", tpn: "Big Thunder Mountain Railroad", qt: 323, qtn: "Big Thunder Mountain Railroad" },
    "dl-mark-twain":          { tp: "6c30d5b0-8c0a-406f-9258-0b6c55d4a5e4", tpn: "Mark Twain Riverboat", qt: 456, qtn: "Mark Twain Riverboat" },
    "dl-columbia":            { tp: "c9e39189-7e99-4e0a-97e0-4a0d5654d257", tpn: "Sailing Ship Columbia", qt: 328, qtn: "Sailing Ship Columbia" },
    "dl-tom-sawyer":          { tp: "07952343-3498-404b-8337-734de9a185c1", tpn: "Pirate's Lair on Tom Sawyer Island", qt: 331, qtn: "Pirate's Lair on Tom Sawyer Island" },
    "dl-shootin":             { tp: "835deb74-de54-4d7f-9dc4-dacab90fcb60", tpn: "Frontierland Shootin' Exposition", qt: 679, qtn: "Frontierland Shootin' Exposition" },
    "dl-matterhorn":          { tp: "faaa8be9-cc1e-4535-ac20-04a535654bd0", tpn: "Matterhorn Bobsleds", qt: 279, qtn: "Matterhorn Bobsleds" },
    "dl-small-world":         { tp: "3638ac09-9fce-4a43-8c79-8ebbe17afce2", tpn: "\"it's a small world\"", qt: 307, qtn: "\"it's a small world\"" },
    "dl-peter-pan":           { tp: "c23af6ba-8515-406a-8a48-d0818ba0bfc9", tpn: "Peter Pan's Flight", qt: 281, qtn: "Peter Pan's Flight" },
    "dl-snow-white":          { tp: "4f0053e7-b8db-4833-b02f-35e1c91b4523", tpn: "Snow White's Enchanted Wish", qt: 283, qtn: "Snow White's Enchanted Wish" },
    "dl-pinocchio":           { tp: "90ee50d4-7cc9-4824-b29d-2aac801acc29", tpn: "Pinocchio's Daring Journey", qt: 282, qtn: "Pinocchio's Daring Journey" },
    "dl-mr-toad":             { tp: "9d401ad3-49b2-469f-ac73-93eb429428fb", tpn: "Mr. Toad's Wild Ride", qt: 280, qtn: "Mr. Toad's Wild Ride" },
    "dl-alice":               { tp: "a07f3110-013e-43bb-a182-e66bb8b5e28d", tpn: "Alice in Wonderland", qt: 285, qtn: "Alice in Wonderland" },
    "dl-teacups":             { tp: "e0cfed11-96d7-40f3-907f-5cfed172592a", tpn: "Mad Tea Party", qt: 278, qtn: "Mad Tea Party" },
    "dl-carrousel":           { tp: "f7904912-3f08-4563-b99e-fd59f43cc9f2", tpn: "King Arthur Carrousel", qt: 277, qtn: "King Arthur Carrousel" },
    "dl-dumbo":               { tp: "cc980e8e-192f-48b6-848c-27784084e54b", tpn: "Dumbo the Flying Elephant", qt: 275, qtn: "Dumbo the Flying Elephant" },
    "dl-casey-jr":            { tp: "8e686e4c-f3db-4d9c-a185-2d54b1fa8899", tpn: "Casey Jr. Circus Train", qt: 303, qtn: "Casey Jr. Circus Train" },
    "dl-storybook":           { tp: "cb929138-d77a-4dd2-983c-f651bbd1bd92", tpn: "Storybook Land Canal Boats", qt: 305, qtn: "Storybook Land Canal Boats" },
    "dl-castle-walk":         { tp: "90d5a091-478c-4df1-adfe-c605b4005013", tpn: "Sleeping Beauty Castle Walkthrough", qt: 687, qtn: "Sleeping Beauty Castle Walkthrough" },
    "dl-bluey":               { tp: "888525b0-5a6f-4b8e-9f07-b6a32812b04d", tpn: "Bluey’s Best Day Ever! at Fantasyland Theatre", qt: 16254, qtn: "Bluey’s Best Day Ever! at Fantasyland Theatre" },
    "dl-runaway":             { tp: "cd670bff-81d1-4f34-8676-7bafdf49220a", tpn: "Mickey & Minnie's Runaway Railway", qt: 11526, qtn: "Mickey & Minnie's Runaway Railway" },
    "dl-gadgetcoaster":       { tp: "59647168-d239-4161-8b24-92eb128e96fb", tpn: "Chip 'n' Dale's GADGETcoaster", qt: 324, qtn: "Chip 'n' Dale's GADGETcoaster" },
    "dl-roger-rabbit":        { tp: "6ce9cdd1-0a43-459e-83cd-f4cace9cfa7b", tpn: "Roger Rabbit's Car Toon Spin", qt: 332, qtn: "Roger Rabbit's Car Toon Spin" },
    "dl-duck-pond":           { tp: "ca32ef8a-ae0d-4c24-bf4f-e59192122e01", tpn: "Donald's Duck Pond", qt: 13814, qtn: "Donald's Duck Pond" },
    "dl-goofy-yard":          { tp: "b0eca3d3-a519-47f9-a5a7-9911126da2df", tpn: "Goofy's How-to-Play Yard", qt: 11980, qtn: "Goofy's How-to-Play Yard" },
    "dl-minnie-house":        { tp: "c02fb82d-0860-4e95-8c61-899fa594d20e", tpn: "Minnie's House", qt: 684, qtn: "Minnie's House" },
    /* Queue-Times carries this one twice under two ids; 709 is the one that
       reports a wait, 327 is a stale duplicate listed in ignoredFeedRows. */
    "dl-mickey-house":        { tp: "5a107a57-9174-4f3f-9be7-625a5d5bb899", tpn: "Mickey's House and Meet Mickey Mouse", qt: 709, qtn: "Mickey's House and Meet Mickey Mouse" },
    "dl-rise":                { tp: "34b1d70f-11c4-42df-935e-d5582c9f1a8e", tpn: "Star Wars: Rise of the Resistance", qt: 6340, qtn: "Star Wars: Rise of the Resistance" },
    "dl-falcon":              { tp: "b2c2549c-e9da-4fdd-98ea-1dcff596fed7", tpn: "Millennium Falcon: Smugglers Run", qt: 6339, qtn: "Millennium Falcon: Smugglers Run", qtSingle: 10903 },
    "dl-shadows":             { tp: "fa0ef252-8002-4c39-934b-46c3231d206e", tpn: "Shadows of Memory: A Skywalker Saga", qt: null, qtn: null },
    "dl-space":               { tp: "9167db1d-e5e7-46da-a07f-ae30a87bc4c4", tpn: "Space Mountain", qt: 284, qtn: "Space Mountain" },
    "dl-star-tours":          { tp: "cc718d11-fa15-44ee-87d0-ded989ad61bc", tpn: "Star Tours - The Adventures Continue", qt: 286, qtn: "Star Tours - The Adventures Continue" },
    "dl-buzz":                { tp: "88197808-3c56-4198-a5a4-6066541251cf", tpn: "Buzz Lightyear Astro Blasters", qt: 273, qtn: "Buzz Lightyear Astro Blasters" },
    "dl-nemo":                { tp: "64d44aaa-6857-4693-b24b-bcff6c6dcfa1", tpn: "Finding Nemo Submarine Voyage", qt: 276, qtn: "Finding Nemo Submarine Voyage" },
    "dl-autopia":             { tp: "1da85181-bf0f-4ccc-b98e-243142f7347b", tpn: "Autopia", qt: 317, qtn: "Autopia" },
    "dl-astro-orbitor":       { tp: "6c225598-91c9-44a3-95e2-7c423475db61", tpn: "Astro Orbitor", qt: 287, qtn: "Astro Orbitor" },
    "dl-monorail":            { tp: "56d0bd6d-5106-4420-8f60-0005475c04c3", tpn: "Disneyland Monorail", qt: 274, qtn: "Disneyland Monorail" },
    "dl-pixar-shorts":        { tp: "526ada11-4688-442b-96d4-4077eac4f988", tpn: "Pixar Short Film Spotlight", qt: 16627, qtn: "Pixar Short Film Spotlight" },
    "dl-fantasmic":           { tp: "8c36ff0b-3a32-4d7b-9388-0516c19277db", tpn: "Fantasmic!", qt: null, qtn: null },
    "dl-halloween-screams":   { tp: "0bd8e001-83f8-4c9e-9e14-df5a2d6400c3", tpn: "Halloween Screams with Fireworks", qt: null, qtn: null },
    "dl-paint-night":         { tp: "c60e9de0-df2b-4484-9b05-299939dc247a", tpn: "Paint the Night", qt: null, qtn: null },
    "dl-wondrous":            { tp: "414c1f1e-335a-47ae-9f91-26c569edb56b", tpn: "Wondrous Journeys", qt: null, qtn: null },
    "dl-tapestry":            { tp: "34f7bd8a-ec8e-41ac-9d63-d94ffc54f1ef", tpn: "Tapestry of Happiness", qt: null, qtn: null },
    "dl-hall-cavalcade":      { tp: "e1cb16d6-ac90-44e6-9711-6729650623a1", tpn: "Mickey and Friends Halloween Cavalcade", qt: null, qtn: null },

    /* ---------------- Disney California Adventure ---------------- */
    "ca-monsters-inc":        { tp: "40524fba-5d84-49e7-9204-f493dbe2d5a4", tpn: "Monsters, Inc. Mike & Sulley to the Rescue!", qt: 291, qtn: "Monsters, Inc. Mike & Sulley to the Rescue!" },
    "ca-philharmagic":        { tp: "8f586a2f-cef5-46d3-b822-fd622c4e9e33", tpn: "Mickey's PhilharMagic", qt: 6440, qtn: "Mickey's PhilharMagic" },
    "ca-animation":           { tp: "d2aa0987-49a2-45dc-a635-3a8bf7401230", tpn: "Animation Academy", qt: 321, qtn: "Animation Academy" },
    "ca-turtle-talk":         { tp: "7561bcd8-18ea-4e3f-89d5-c905b7ba3d42", tpn: "Turtle Talk with Crush", qt: 294, qtn: "Turtle Talk with Crush" },
    "ca-sorcerers":           { tp: "44c1f655-25d3-440c-b1a8-db736a12b105", tpn: "Sorcerer's Workshop", qt: 868, qtn: "Sorcerer's Workshop" },
    "ca-guardians":           { tp: "b7678dab-5544-48d5-8fdc-c1a0127cfbcd", tpn: "Guardians of the Galaxy - Mission: BREAKOUT!", qt: 329, qtn: "Guardians of the Galaxy - Mission: BREAKOUT!" },
    "ca-web-slingers":        { tp: "2295351d-ce6b-4c04-92d5-5b416372c5b5", tpn: "WEB SLINGERS: A Spider-Man Adventure", qt: 8843, qtn: "WEB SLINGERS: A Spider-Man Adventure", qtSingle: 10907 },
    "ca-spiderman":           { tp: "bdb0a3ec-eb7a-41c9-918f-ccee7194743e", tpn: "The Amazing Spider-Man!", qt: null, qtn: null },
    "ca-grizzly":             { tp: "b1d285a7-2444-4a7c-b7bb-d2d4d6428a85", tpn: "Grizzly River Run", qt: 302, qtn: "Grizzly River Run" },
    "ca-soarin":              { tp: "77f205a4-d482-4d91-a5ff-71e54a086ad2", tpn: "Soarin’ Across America", qt: 17129, qtn: "Soarin’ Across America" },
    "ca-redwood":             { tp: "c9803366-6f37-4406-82af-7692357e3ca9", tpn: "Redwood Creek Challenge Trail", qt: 293, qtn: "Redwood Creek Challenge Trail" },
    "ca-bakery":              { tp: "eb77ee1f-3207-44fd-acfc-d7bc18602007", tpn: "The Bakery Tour", qt: 869, qtn: "The Bakery Tour" },
    "ca-racers":              { tp: "c60c768b-3461-465c-8f4f-b44b087506fc", tpn: "Radiator Springs Racers", qt: 295, qtn: "Radiator Springs Racers", qtSingle: 10904 },
    "ca-luigi":               { tp: "7a09a2f0-e226-4f3e-86f8-2598ab67ec44", tpn: "Luigi's Honkin' Haul-O-Ween", qt: 2608, qtn: "Luigi's Honkin' Haul-O-Ween" },
    "ca-mater":               { tp: "46097afe-a1ea-4807-93d3-14d14f36e55f", tpn: "Mater's Graveyard JamBOOree", qt: 4723, qtn: "Mater's Graveyard JamBOOree" },
    "ca-incredicoaster":      { tp: "5d07a2b1-49ca-4de7-9d32-6d08edf69b08", tpn: "Incredicoaster", qt: 322, qtn: "Incredicoaster", qtSingle: 10906 },
    "ca-toy-story":           { tp: "86ab3069-110d-49c5-a7e7-29ddf28695a6", tpn: "Toy Story Midway Mania!", qt: 313, qtn: "Toy Story Midway Mania!" },
    "ca-pal-swing":           { tp: "528016ef-db24-47fa-a0f2-b6d26d61e29f", tpn: "Pixar Pal-A-Round - Swinging", qt: 311, qtn: "Pixar Pal-A-Round - Swinging" },
    "ca-pal-still":           { tp: "4ca6cdbf-4c5f-45bf-b0dc-db83393ec208", tpn: "Pixar Pal-A-Round – Non-Swinging", qt: 5557, qtn: "Pixar Pal-A-Round – Non-Swinging" },
    "ca-inside-out":          { tp: "6d876f4c-c3ff-4ae3-a2d8-d4b831e1039b", tpn: "Inside Out Emotional Whirlwind", qt: 6643, qtn: "Inside Out Emotional Whirlwind" },
    "ca-jessie":              { tp: "388ad3f1-5cf5-4a9d-8d0e-6dfb817d7822", tpn: "Jessie's Critter Carousel", qt: 310, qtn: "Jessie's Critter Carousel" },
    "ca-midway-games":        { tp: "1d24dd7a-372b-4195-8ad0-ba9679d72b08", tpn: "Games of Pixar Pier", qt: 866, qtn: "Games of Pixar Pier" },
    "ca-little-mermaid":      { tp: "e1fbc7a1-2cd1-4282-b373-ac11d9d9d38a", tpn: "The Little Mermaid - Ariel's Undersea Adventure", qt: 316, qtn: "The Little Mermaid - Ariel's Undersea Adventure" },
    "ca-golden-zephyr":       { tp: "10a5fc6f-5ad3-414b-9bdd-e6bae097b6ad", tpn: "Golden Zephyr", qt: 298, qtn: "Golden Zephyr" },
    "ca-silly-swings":        { tp: "4f5b28d0-b78e-482b-8e2e-1f90756d6220", tpn: "Silly Symphony Swings", qt: 301, qtn: "Silly Symphony Swings", qtSingle: 10905 },
    "ca-goofy-sky":           { tp: "f44a5072-3cda-4c7c-8574-33ad09d16cca", tpn: "Goofy's Sky School", qt: 319, qtn: "Goofy's Sky School" },
    "ca-jellyfish":           { tp: "c8a4b7b1-c1b2-4dfe-b73c-4e834b4a73db", tpn: "Jumpin' Jellyfish", qt: 300, qtn: "Jumpin' Jellyfish" },
    "ca-world-of-color":      { tp: "e46d8982-4991-4b9e-8e4a-b519d3ca6060", tpn: "World of Color – ONE", qt: 11528, qtn: "World of Color – ONE" },
    "ca-woc-happiness":       { tp: "457e2029-852f-4de7-9ca0-e4cc6f0cfcad", tpn: "World of Color Happiness!", qt: null, qtn: null },
    "ca-dance-off":           { tp: "0c6c7664-94f0-48b0-91ce-7cc2108a72c9", tpn: "Guardians of the Galaxy: Awesome Dance Off!", qt: null, qtn: null },
    "ca-five-dime":           { tp: "449e351b-a05a-4a52-8893-0ed5c1f6fc48", tpn: "Five & Dime", qt: null, qtn: null },
    "ca-green-army":          { tp: "af195dcb-a69e-499a-b659-6751ee871f79", tpn: "Operation: Playtime! - featuring the Green Army Patrol", qt: null, qtn: null },
    "ca-oogie-monsters":      { tp: "2108cc58-80df-4fff-9b91-735e89873ffd", tpn: "Guardians of the Galaxy - Monsters After Dark", qt: 5146, qtn: "Guardians of the Galaxy - Monsters After Dark" },
    "ca-oogie-treats":        { tp: "75dfd5ed-4bfb-4727-b24a-bf5fb2284950", tpn: "Treat Trails at Oogie Boogie Bash", qt: null, qtn: null },
    "ca-oogie-grove":         { tp: "24066306-d364-4048-b4c9-a0e81980c5b4", tpn: "Villains Grove at Oogie Boogie Bash", qt: 7292, qtn: "Villains Grove at Oogie Boogie Bash" },
    "ca-oogie-leota":         { tp: "26468072-7cdf-4d3b-a5fb-b110d51b177f", tpn: "Madame Leota's Swinging Wake – A Haunted Mansion Street Party at Oogie Boogie Bash", qt: null, qtn: null },
  },
};
