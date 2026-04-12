/**
 * Fast Track Avatar Catalog
 * Hundreds of diverse avatars organized by category
 * Uses emoji for universal cross-platform compatibility
 */

const AVATAR_CATALOG = {
    // =========================================================================
    // PEOPLE
    // =========================================================================
    people: {
        name: "People",
        icon: "👥",
        avatars: [
            // Faces
            { id: "person_smile", emoji: "😊", name: "Smiling" },
            { id: "person_cool", emoji: "😎", name: "Cool" },
            { id: "person_wink", emoji: "😉", name: "Winking" },
            { id: "person_think", emoji: "🤔", name: "Thinking" },
            { id: "person_nerd", emoji: "🤓", name: "Nerd" },
            { id: "person_star", emoji: "🤩", name: "Star Struck" },
            { id: "person_party", emoji: "🥳", name: "Party" },
            { id: "person_laugh", emoji: "😂", name: "Laughing" },
            { id: "person_confident", emoji: "😏", name: "Confident" },
            { id: "person_determined", emoji: "😤", name: "Determined" },
            { id: "person_mindblown", emoji: "🤯", name: "Mind Blown" },
            { id: "person_shy", emoji: "😳", name: "Shy" },
            { id: "person_clever", emoji: "🧐", name: "Clever" },
            { id: "person_zany", emoji: "🤪", name: "Zany" },
            { id: "person_love", emoji: "🥰", name: "Love" },
            // People
            { id: "person_man", emoji: "👨", name: "Man" },
            { id: "person_woman", emoji: "👩", name: "Woman" },
            { id: "person_child", emoji: "🧒", name: "Child" },
            { id: "person_elder_m", emoji: "👴", name: "Elder Man" },
            { id: "person_elder_w", emoji: "👵", name: "Elder Woman" },
            { id: "person_baby", emoji: "👶", name: "Baby" },
            { id: "person_beard", emoji: "🧔", name: "Bearded" },
            { id: "person_blonde", emoji: "👱", name: "Blonde" },
            { id: "person_curly", emoji: "🧑‍🦱", name: "Curly Hair" },
            { id: "person_redhead", emoji: "🧑‍🦰", name: "Red Hair" },
            { id: "person_white", emoji: "🧑‍🦳", name: "White Hair" },
            { id: "person_bald", emoji: "🧑‍🦲", name: "Bald" },
            // Gestures
            { id: "person_wave", emoji: "👋", name: "Waving" },
            { id: "person_clap", emoji: "👏", name: "Clapping" },
            { id: "person_thumbsup", emoji: "👍", name: "Thumbs Up" },
            { id: "person_victory", emoji: "✌️", name: "Victory" },
            { id: "person_fist", emoji: "✊", name: "Raised Fist" },
            { id: "person_muscle", emoji: "💪", name: "Strong" },
            { id: "person_pray", emoji: "🙏", name: "Prayer" },
            { id: "person_point", emoji: "👆", name: "Pointing" },
        ]
    },

    // =========================================================================
    // ANIMALS
    // =========================================================================
    animals: {
        name: "Animals",
        icon: "🐾",
        avatars: [
            // Pets
            { id: "animal_dog", emoji: "🐕", name: "Dog" },
            { id: "animal_cat", emoji: "🐈", name: "Cat" },
            { id: "animal_hamster", emoji: "🐹", name: "Hamster" },
            { id: "animal_rabbit", emoji: "🐰", name: "Rabbit" },
            { id: "animal_parrot", emoji: "🦜", name: "Parrot" },
            { id: "animal_fish", emoji: "🐠", name: "Fish" },
            { id: "animal_turtle", emoji: "🐢", name: "Turtle" },
            // Wild Animals
            { id: "animal_lion", emoji: "🦁", name: "Lion" },
            { id: "animal_tiger", emoji: "🐅", name: "Tiger" },
            { id: "animal_bear", emoji: "🐻", name: "Bear" },
            { id: "animal_panda", emoji: "🐼", name: "Panda" },
            { id: "animal_koala", emoji: "🐨", name: "Koala" },
            { id: "animal_wolf", emoji: "🐺", name: "Wolf" },
            { id: "animal_fox", emoji: "🦊", name: "Fox" },
            { id: "animal_elephant", emoji: "🐘", name: "Elephant" },
            { id: "animal_giraffe", emoji: "🦒", name: "Giraffe" },
            { id: "animal_zebra", emoji: "🦓", name: "Zebra" },
            { id: "animal_gorilla", emoji: "🦍", name: "Gorilla" },
            { id: "animal_monkey", emoji: "🐵", name: "Monkey" },
            { id: "animal_leopard", emoji: "🐆", name: "Leopard" },
            // Birds
            { id: "animal_eagle", emoji: "🦅", name: "Eagle" },
            { id: "animal_owl", emoji: "🦉", name: "Owl" },
            { id: "animal_flamingo", emoji: "🦩", name: "Flamingo" },
            { id: "animal_peacock", emoji: "🦚", name: "Peacock" },
            { id: "animal_swan", emoji: "🦢", name: "Swan" },
            { id: "animal_duck", emoji: "🦆", name: "Duck" },
            { id: "animal_penguin", emoji: "🐧", name: "Penguin" },
            { id: "animal_dove", emoji: "🕊️", name: "Dove" },
            // Sea
            { id: "animal_shark", emoji: "🦈", name: "Shark" },
            { id: "animal_whale", emoji: "🐋", name: "Whale" },
            { id: "animal_dolphin", emoji: "🐬", name: "Dolphin" },
            { id: "animal_octopus", emoji: "🐙", name: "Octopus" },
            { id: "animal_crab", emoji: "🦀", name: "Crab" },
            { id: "animal_lobster", emoji: "🦞", name: "Lobster" },
            // Other
            { id: "animal_snake", emoji: "🐍", name: "Snake" },
            { id: "animal_dragon", emoji: "🐉", name: "Dragon" },
            { id: "animal_unicorn", emoji: "🦄", name: "Unicorn" },
            { id: "animal_butterfly", emoji: "🦋", name: "Butterfly" },
            { id: "animal_bee", emoji: "🐝", name: "Bee" },
            { id: "animal_ladybug", emoji: "🐞", name: "Ladybug" },
            { id: "animal_bat", emoji: "🦇", name: "Bat" },
            { id: "animal_horse", emoji: "🐴", name: "Horse" },
            { id: "animal_deer", emoji: "🦌", name: "Deer" },
        ]
    },

    // =========================================================================
    // FOOD
    // =========================================================================
    food: {
        name: "Food",
        icon: "🍕",
        avatars: [
            // Fruits
            { id: "food_apple", emoji: "🍎", name: "Apple" },
            { id: "food_orange", emoji: "🍊", name: "Orange" },
            { id: "food_lemon", emoji: "🍋", name: "Lemon" },
            { id: "food_banana", emoji: "🍌", name: "Banana" },
            { id: "food_watermelon", emoji: "🍉", name: "Watermelon" },
            { id: "food_grapes", emoji: "🍇", name: "Grapes" },
            { id: "food_strawberry", emoji: "🍓", name: "Strawberry" },
            { id: "food_cherry", emoji: "🍒", name: "Cherry" },
            { id: "food_peach", emoji: "🍑", name: "Peach" },
            { id: "food_pineapple", emoji: "🍍", name: "Pineapple" },
            { id: "food_mango", emoji: "🥭", name: "Mango" },
            { id: "food_avocado", emoji: "🥑", name: "Avocado" },
            // Vegetables
            { id: "food_carrot", emoji: "🥕", name: "Carrot" },
            { id: "food_corn", emoji: "🌽", name: "Corn" },
            { id: "food_pepper", emoji: "🌶️", name: "Hot Pepper" },
            { id: "food_broccoli", emoji: "🥦", name: "Broccoli" },
            { id: "food_mushroom", emoji: "🍄", name: "Mushroom" },
            // Fast Food
            { id: "food_pizza", emoji: "🍕", name: "Pizza" },
            { id: "food_burger", emoji: "🍔", name: "Burger" },
            { id: "food_hotdog", emoji: "🌭", name: "Hot Dog" },
            { id: "food_fries", emoji: "🍟", name: "Fries" },
            { id: "food_taco", emoji: "🌮", name: "Taco" },
            { id: "food_burrito", emoji: "🌯", name: "Burrito" },
            { id: "food_sandwich", emoji: "🥪", name: "Sandwich" },
            // Desserts
            { id: "food_cake", emoji: "🎂", name: "Cake" },
            { id: "food_cupcake", emoji: "🧁", name: "Cupcake" },
            { id: "food_donut", emoji: "🍩", name: "Donut" },
            { id: "food_icecream", emoji: "🍦", name: "Ice Cream" },
            { id: "food_cookie", emoji: "🍪", name: "Cookie" },
            { id: "food_chocolate", emoji: "🍫", name: "Chocolate" },
            { id: "food_candy", emoji: "🍬", name: "Candy" },
            { id: "food_lollipop", emoji: "🍭", name: "Lollipop" },
            // Drinks
            { id: "food_coffee", emoji: "☕", name: "Coffee" },
            { id: "food_tea", emoji: "🍵", name: "Tea" },
            { id: "food_soda", emoji: "🥤", name: "Soda" },
            { id: "food_juice", emoji: "🧃", name: "Juice" },
            { id: "food_beer", emoji: "🍺", name: "Beer" },
            { id: "food_wine", emoji: "🍷", name: "Wine" },
            { id: "food_cocktail", emoji: "🍸", name: "Cocktail" },
        ]
    },

    // =========================================================================
    // SPACE
    // =========================================================================
    space: {
        name: "Space",
        icon: "🚀",
        avatars: [
            { id: "space_rocket", emoji: "🚀", name: "Rocket" },
            { id: "space_ufo", emoji: "🛸", name: "UFO" },
            { id: "space_satellite", emoji: "🛰️", name: "Satellite" },
            { id: "space_astronaut", emoji: "🧑‍🚀", name: "Astronaut" },
            { id: "space_alien", emoji: "👽", name: "Alien" },
            { id: "space_alien_monster", emoji: "👾", name: "Alien Monster" },
            { id: "space_robot", emoji: "🤖", name: "Robot" },
            { id: "space_sun", emoji: "☀️", name: "Sun" },
            { id: "space_moon", emoji: "🌙", name: "Moon" },
            { id: "space_full_moon", emoji: "🌕", name: "Full Moon" },
            { id: "space_crescent", emoji: "🌙", name: "Crescent Moon" },
            { id: "space_star", emoji: "⭐", name: "Star" },
            { id: "space_stars", emoji: "✨", name: "Sparkles" },
            { id: "space_shooting", emoji: "🌠", name: "Shooting Star" },
            { id: "space_milky_way", emoji: "🌌", name: "Milky Way" },
            { id: "space_meteor", emoji: "☄️", name: "Meteor" },
            { id: "space_earth", emoji: "🌍", name: "Earth" },
            { id: "space_globe", emoji: "🌐", name: "Globe" },
            { id: "space_saturn", emoji: "🪐", name: "Saturn" },
            { id: "space_telescope", emoji: "🔭", name: "Telescope" },
            { id: "space_eclipse", emoji: "🌑", name: "Eclipse" },
            { id: "space_orbit", emoji: "🌎", name: "Orbit" },
        ]
    },

    // =========================================================================
    // FLAGS
    // =========================================================================
    flags: {
        name: "Flags",
        icon: "🏳️",
        avatars: [
            // Americas
            { id: "flag_us", emoji: "🇺🇸", name: "USA" },
            { id: "flag_ca", emoji: "🇨🇦", name: "Canada" },
            { id: "flag_mx", emoji: "🇲🇽", name: "Mexico" },
            { id: "flag_br", emoji: "🇧🇷", name: "Brazil" },
            { id: "flag_ar", emoji: "🇦🇷", name: "Argentina" },
            { id: "flag_co", emoji: "🇨🇴", name: "Colombia" },
            { id: "flag_pe", emoji: "🇵🇪", name: "Peru" },
            { id: "flag_cl", emoji: "🇨🇱", name: "Chile" },
            { id: "flag_jm", emoji: "🇯🇲", name: "Jamaica" },
            { id: "flag_pr", emoji: "🇵🇷", name: "Puerto Rico" },
            // Europe
            { id: "flag_gb", emoji: "🇬🇧", name: "United Kingdom" },
            { id: "flag_de", emoji: "🇩🇪", name: "Germany" },
            { id: "flag_fr", emoji: "🇫🇷", name: "France" },
            { id: "flag_es", emoji: "🇪🇸", name: "Spain" },
            { id: "flag_it", emoji: "🇮🇹", name: "Italy" },
            { id: "flag_pt", emoji: "🇵🇹", name: "Portugal" },
            { id: "flag_nl", emoji: "🇳🇱", name: "Netherlands" },
            { id: "flag_be", emoji: "🇧🇪", name: "Belgium" },
            { id: "flag_se", emoji: "🇸🇪", name: "Sweden" },
            { id: "flag_no", emoji: "🇳🇴", name: "Norway" },
            { id: "flag_dk", emoji: "🇩🇰", name: "Denmark" },
            { id: "flag_fi", emoji: "🇫🇮", name: "Finland" },
            { id: "flag_ie", emoji: "🇮🇪", name: "Ireland" },
            { id: "flag_ch", emoji: "🇨🇭", name: "Switzerland" },
            { id: "flag_at", emoji: "🇦🇹", name: "Austria" },
            { id: "flag_pl", emoji: "🇵🇱", name: "Poland" },
            { id: "flag_ru", emoji: "🇷🇺", name: "Russia" },
            { id: "flag_ua", emoji: "🇺🇦", name: "Ukraine" },
            { id: "flag_gr", emoji: "🇬🇷", name: "Greece" },
            { id: "flag_cz", emoji: "🇨🇿", name: "Czechia" },
            // Asia
            { id: "flag_jp", emoji: "🇯🇵", name: "Japan" },
            { id: "flag_kr", emoji: "🇰🇷", name: "South Korea" },
            { id: "flag_cn", emoji: "🇨🇳", name: "China" },
            { id: "flag_in", emoji: "🇮🇳", name: "India" },
            { id: "flag_th", emoji: "🇹🇭", name: "Thailand" },
            { id: "flag_vn", emoji: "🇻🇳", name: "Vietnam" },
            { id: "flag_ph", emoji: "🇵🇭", name: "Philippines" },
            { id: "flag_id", emoji: "🇮🇩", name: "Indonesia" },
            { id: "flag_my", emoji: "🇲🇾", name: "Malaysia" },
            { id: "flag_sg", emoji: "🇸🇬", name: "Singapore" },
            { id: "flag_pk", emoji: "🇵🇰", name: "Pakistan" },
            { id: "flag_sa", emoji: "🇸🇦", name: "Saudi Arabia" },
            { id: "flag_ae", emoji: "🇦🇪", name: "UAE" },
            { id: "flag_il", emoji: "🇮🇱", name: "Israel" },
            { id: "flag_tr", emoji: "🇹🇷", name: "Turkey" },
            // Africa
            { id: "flag_za", emoji: "🇿🇦", name: "South Africa" },
            { id: "flag_eg", emoji: "🇪🇬", name: "Egypt" },
            { id: "flag_ng", emoji: "🇳🇬", name: "Nigeria" },
            { id: "flag_ke", emoji: "🇰🇪", name: "Kenya" },
            { id: "flag_gh", emoji: "🇬🇭", name: "Ghana" },
            { id: "flag_et", emoji: "🇪🇹", name: "Ethiopia" },
            { id: "flag_ma", emoji: "🇲🇦", name: "Morocco" },
            // Oceania
            { id: "flag_au", emoji: "🇦🇺", name: "Australia" },
            { id: "flag_nz", emoji: "🇳🇿", name: "New Zealand" },
            { id: "flag_fj", emoji: "🇫🇯", name: "Fiji" },
            // Special
            { id: "flag_un", emoji: "🇺🇳", name: "United Nations" },
            { id: "flag_eu", emoji: "🇪🇺", name: "European Union" },
            { id: "flag_rainbow", emoji: "🏳️‍🌈", name: "Rainbow" },
            { id: "flag_pirate", emoji: "🏴‍☠️", name: "Pirate" },
        ]
    },

    // =========================================================================
    // TRADES / PROFESSIONS
    // =========================================================================
    trades: {
        name: "Trades",
        icon: "👷",
        avatars: [
            { id: "trade_doctor", emoji: "👨‍⚕️", name: "Doctor" },
            { id: "trade_nurse", emoji: "👩‍⚕️", name: "Nurse" },
            { id: "trade_scientist", emoji: "👨‍🔬", name: "Scientist" },
            { id: "trade_engineer", emoji: "👷", name: "Engineer" },
            { id: "trade_firefighter", emoji: "👨‍🚒", name: "Firefighter" },
            { id: "trade_police", emoji: "👮", name: "Police" },
            { id: "trade_detective", emoji: "🕵️", name: "Detective" },
            { id: "trade_soldier", emoji: "💂", name: "Guard" },
            { id: "trade_chef", emoji: "👨‍🍳", name: "Chef" },
            { id: "trade_farmer", emoji: "👨‍🌾", name: "Farmer" },
            { id: "trade_teacher", emoji: "👨‍🏫", name: "Teacher" },
            { id: "trade_student", emoji: "👨‍🎓", name: "Graduate" },
            { id: "trade_artist", emoji: "👨‍🎨", name: "Artist" },
            { id: "trade_singer", emoji: "👨‍🎤", name: "Singer" },
            { id: "trade_pilot", emoji: "👨‍✈️", name: "Pilot" },
            { id: "trade_astronaut", emoji: "👨‍🚀", name: "Astronaut" },
            { id: "trade_judge", emoji: "👨‍⚖️", name: "Judge" },
            { id: "trade_mechanic", emoji: "👨‍🔧", name: "Mechanic" },
            { id: "trade_factory", emoji: "👨‍🏭", name: "Factory Worker" },
            { id: "trade_office", emoji: "👨‍💼", name: "Office Worker" },
            { id: "trade_tech", emoji: "👨‍💻", name: "Developer" },
            { id: "trade_ninja", emoji: "🥷", name: "Ninja" },
            { id: "trade_superhero", emoji: "🦸", name: "Superhero" },
            { id: "trade_supervillain", emoji: "🦹", name: "Supervillain" },
            { id: "trade_mage", emoji: "🧙", name: "Wizard" },
            { id: "trade_fairy", emoji: "🧚", name: "Fairy" },
            { id: "trade_vampire", emoji: "🧛", name: "Vampire" },
            { id: "trade_elf", emoji: "🧝", name: "Elf" },
            { id: "trade_genie", emoji: "🧞", name: "Genie" },
            { id: "trade_zombie", emoji: "🧟", name: "Zombie" },
        ]
    },

    // =========================================================================
    // FANTASY
    // =========================================================================
    fantasy: {
        name: "Fantasy",
        icon: "🐲",
        avatars: [
            { id: "fantasy_dragon", emoji: "🐲", name: "Dragon" },
            { id: "fantasy_unicorn", emoji: "🦄", name: "Unicorn" },
            { id: "fantasy_phoenix", emoji: "🔥", name: "Phoenix" },
            { id: "fantasy_wizard", emoji: "🧙", name: "Wizard" },
            { id: "fantasy_witch", emoji: "🧙‍♀️", name: "Witch" },
            { id: "fantasy_elf", emoji: "🧝", name: "Elf" },
            { id: "fantasy_fairy", emoji: "🧚", name: "Fairy" },
            { id: "fantasy_mermaid", emoji: "🧜", name: "Mermaid" },
            { id: "fantasy_genie", emoji: "🧞", name: "Genie" },
            { id: "fantasy_vampire", emoji: "🧛", name: "Vampire" },
            { id: "fantasy_zombie", emoji: "🧟", name: "Zombie" },
            { id: "fantasy_troll", emoji: "🧟‍♂️", name: "Troll" },
            { id: "fantasy_ghost", emoji: "👻", name: "Ghost" },
            { id: "fantasy_skull", emoji: "💀", name: "Skull" },
            { id: "fantasy_devil", emoji: "😈", name: "Devil" },
            { id: "fantasy_ogre", emoji: "👹", name: "Ogre" },
            { id: "fantasy_goblin", emoji: "👺", name: "Goblin" },
            { id: "fantasy_jack", emoji: "🎃", name: "Jack-o-Lantern" },
            { id: "fantasy_clown", emoji: "🤡", name: "Clown" },
            { id: "fantasy_crystal", emoji: "🔮", name: "Crystal Ball" },
            { id: "fantasy_sword", emoji: "⚔️", name: "Crossed Swords" },
            { id: "fantasy_shield", emoji: "🛡️", name: "Shield" },
            { id: "fantasy_crown", emoji: "👑", name: "Crown" },
            { id: "fantasy_ring", emoji: "💍", name: "Ring" },
            { id: "fantasy_gem", emoji: "💎", name: "Gem" },
            { id: "fantasy_scroll", emoji: "📜", name: "Scroll" },
            { id: "fantasy_wand", emoji: "🪄", name: "Magic Wand" },
            { id: "fantasy_potion", emoji: "🧪", name: "Potion" },
        ]
    },

    // =========================================================================
    // SCI-FI
    // =========================================================================
    scifi: {
        name: "Sci-Fi",
        icon: "🤖",
        avatars: [
            { id: "scifi_robot", emoji: "🤖", name: "Robot" },
            { id: "scifi_alien", emoji: "👽", name: "Alien" },
            { id: "scifi_alien_monster", emoji: "👾", name: "Space Invader" },
            { id: "scifi_ufo", emoji: "🛸", name: "UFO" },
            { id: "scifi_rocket", emoji: "🚀", name: "Rocket" },
            { id: "scifi_satellite", emoji: "🛰️", name: "Satellite" },
            { id: "scifi_cyborg", emoji: "🦾", name: "Mechanical Arm" },
            { id: "scifi_dna", emoji: "🧬", name: "DNA" },
            { id: "scifi_microbe", emoji: "🦠", name: "Microbe" },
            { id: "scifi_gear", emoji: "⚙️", name: "Gear" },
            { id: "scifi_atom", emoji: "⚛️", name: "Atom" },
            { id: "scifi_radioactive", emoji: "☢️", name: "Radioactive" },
            { id: "scifi_biohazard", emoji: "☣️", name: "Biohazard" },
            { id: "scifi_laser", emoji: "🔫", name: "Ray Gun" },
            { id: "scifi_battery", emoji: "🔋", name: "Battery" },
            { id: "scifi_plug", emoji: "🔌", name: "Electric Plug" },
            { id: "scifi_chip", emoji: "💾", name: "Disk" },
            { id: "scifi_computer", emoji: "🖥️", name: "Computer" },
            { id: "scifi_vr", emoji: "🥽", name: "VR Goggles" },
            { id: "scifi_satellite_dish", emoji: "📡", name: "Satellite Dish" },
        ]
    },

    // =========================================================================
    // SCIENCE
    // =========================================================================
    science: {
        name: "Science",
        icon: "🔬",
        avatars: [
            { id: "science_microscope", emoji: "🔬", name: "Microscope" },
            { id: "science_telescope", emoji: "🔭", name: "Telescope" },
            { id: "science_test_tube", emoji: "🧪", name: "Test Tube" },
            { id: "science_petri", emoji: "🧫", name: "Petri Dish" },
            { id: "science_dna", emoji: "🧬", name: "DNA" },
            { id: "science_atom", emoji: "⚛️", name: "Atom" },
            { id: "science_magnet", emoji: "🧲", name: "Magnet" },
            { id: "science_brain", emoji: "🧠", name: "Brain" },
            { id: "science_heart", emoji: "❤️", name: "Heart" },
            { id: "science_bone", emoji: "🦴", name: "Bone" },
            { id: "science_tooth", emoji: "🦷", name: "Tooth" },
            { id: "science_lungs", emoji: "🫁", name: "Lungs" },
            { id: "science_eye", emoji: "👁️", name: "Eye" },
            { id: "science_ear", emoji: "👂", name: "Ear" },
            { id: "science_fire", emoji: "🔥", name: "Fire" },
            { id: "science_water", emoji: "💧", name: "Water" },
            { id: "science_lightning", emoji: "⚡", name: "Lightning" },
            { id: "science_snowflake", emoji: "❄️", name: "Snowflake" },
            { id: "science_leaf", emoji: "🍃", name: "Leaf" },
            { id: "science_tree", emoji: "🌲", name: "Tree" },
            { id: "science_flower", emoji: "🌸", name: "Flower" },
            { id: "science_globe", emoji: "🌍", name: "Earth" },
            { id: "science_volcano", emoji: "🌋", name: "Volcano" },
            { id: "science_mountain", emoji: "🏔️", name: "Mountain" },
            { id: "science_wave", emoji: "🌊", name: "Wave" },
            { id: "science_rainbow", emoji: "🌈", name: "Rainbow" },
        ]
    },

    // =========================================================================
    // ART
    // =========================================================================
    art: {
        name: "Art",
        icon: "🎨",
        avatars: [
            { id: "art_palette", emoji: "🎨", name: "Art Palette" },
            { id: "art_frame", emoji: "🖼️", name: "Picture Frame" },
            { id: "art_brush", emoji: "🖌️", name: "Paintbrush" },
            { id: "art_crayon", emoji: "🖍️", name: "Crayon" },
            { id: "art_pencil", emoji: "✏️", name: "Pencil" },
            { id: "art_pen", emoji: "🖊️", name: "Pen" },
            { id: "art_scissors", emoji: "✂️", name: "Scissors" },
            { id: "art_camera", emoji: "📷", name: "Camera" },
            { id: "art_film", emoji: "🎬", name: "Clapperboard" },
            { id: "art_movie", emoji: "🎥", name: "Movie Camera" },
            { id: "art_music", emoji: "🎵", name: "Music Notes" },
            { id: "art_microphone", emoji: "🎤", name: "Microphone" },
            { id: "art_guitar", emoji: "🎸", name: "Guitar" },
            { id: "art_piano", emoji: "🎹", name: "Piano" },
            { id: "art_violin", emoji: "🎻", name: "Violin" },
            { id: "art_saxophone", emoji: "🎷", name: "Saxophone" },
            { id: "art_trumpet", emoji: "🎺", name: "Trumpet" },
            { id: "art_drum", emoji: "🥁", name: "Drum" },
            { id: "art_ballet", emoji: "🩰", name: "Ballet Shoes" },
            { id: "art_theater", emoji: "🎭", name: "Theater Masks" },
            { id: "art_ticket", emoji: "🎫", name: "Ticket" },
            { id: "art_book", emoji: "📚", name: "Books" },
            { id: "art_newspaper", emoji: "📰", name: "Newspaper" },
            { id: "art_ribbon", emoji: "🎀", name: "Ribbon" },
            { id: "art_balloon", emoji: "🎈", name: "Balloon" },
            { id: "art_confetti", emoji: "🎊", name: "Confetti Ball" },
            { id: "art_sparkler", emoji: "🎇", name: "Sparkler" },
            { id: "art_trophy", emoji: "🏆", name: "Trophy" },
            { id: "art_medal", emoji: "🏅", name: "Medal" },
        ]
    },

    // =========================================================================
    // RELIGION / SPIRITUAL
    // =========================================================================
    spiritual: {
        name: "Spiritual",
        icon: "🙏",
        avatars: [
            { id: "spirit_pray", emoji: "🙏", name: "Prayer" },
            { id: "spirit_peace", emoji: "☮️", name: "Peace" },
            { id: "spirit_om", emoji: "🕉️", name: "Om" },
            { id: "spirit_wheel", emoji: "☸️", name: "Dharma Wheel" },
            { id: "spirit_yin_yang", emoji: "☯️", name: "Yin Yang" },
            { id: "spirit_cross", emoji: "✝️", name: "Cross" },
            { id: "spirit_star_david", emoji: "✡️", name: "Star of David" },
            { id: "spirit_crescent", emoji: "☪️", name: "Star and Crescent" },
            { id: "spirit_menorah", emoji: "🕎", name: "Menorah" },
            { id: "spirit_lotus", emoji: "🪷", name: "Lotus" },
            { id: "spirit_angel", emoji: "👼", name: "Angel" },
            { id: "spirit_halo", emoji: "😇", name: "Halo" },
            { id: "spirit_candle", emoji: "🕯️", name: "Candle" },
            { id: "spirit_dove", emoji: "🕊️", name: "Dove" },
            { id: "spirit_bell", emoji: "🔔", name: "Bell" },
            { id: "spirit_fire", emoji: "🔥", name: "Sacred Fire" },
            { id: "spirit_sun", emoji: "☀️", name: "Sun" },
            { id: "spirit_moon", emoji: "🌙", name: "Moon" },
            { id: "spirit_star", emoji: "⭐", name: "Star" },
            { id: "spirit_infinity", emoji: "♾️", name: "Infinity" },
            { id: "spirit_meditation", emoji: "🧘", name: "Meditation" },
        ]
    },

    // =========================================================================
    // SPORTS
    // =========================================================================
    sports: {
        name: "Sports",
        icon: "⚽",
        avatars: [
            { id: "sport_soccer", emoji: "⚽", name: "Soccer" },
            { id: "sport_basketball", emoji: "🏀", name: "Basketball" },
            { id: "sport_football", emoji: "🏈", name: "Football" },
            { id: "sport_baseball", emoji: "⚾", name: "Baseball" },
            { id: "sport_tennis", emoji: "🎾", name: "Tennis" },
            { id: "sport_volleyball", emoji: "🏐", name: "Volleyball" },
            { id: "sport_rugby", emoji: "🏉", name: "Rugby" },
            { id: "sport_hockey", emoji: "🏒", name: "Hockey" },
            { id: "sport_cricket", emoji: "🏏", name: "Cricket" },
            { id: "sport_pingpong", emoji: "🏓", name: "Ping Pong" },
            { id: "sport_badminton", emoji: "🏸", name: "Badminton" },
            { id: "sport_boxing", emoji: "🥊", name: "Boxing" },
            { id: "sport_martial", emoji: "🥋", name: "Martial Arts" },
            { id: "sport_golf", emoji: "⛳", name: "Golf" },
            { id: "sport_ski", emoji: "⛷️", name: "Skiing" },
            { id: "sport_snowboard", emoji: "🏂", name: "Snowboard" },
            { id: "sport_skate", emoji: "⛸️", name: "Ice Skate" },
            { id: "sport_swim", emoji: "🏊", name: "Swimming" },
            { id: "sport_surf", emoji: "🏄", name: "Surfing" },
            { id: "sport_rowing", emoji: "🚣", name: "Rowing" },
            { id: "sport_climb", emoji: "🧗", name: "Climbing" },
            { id: "sport_bike", emoji: "🚴", name: "Cycling" },
            { id: "sport_run", emoji: "🏃", name: "Running" },
            { id: "sport_lift", emoji: "🏋️", name: "Weight Lifting" },
            { id: "sport_gymnastics", emoji: "🤸", name: "Gymnastics" },
            { id: "sport_horse", emoji: "🏇", name: "Horse Racing" },
            { id: "sport_race", emoji: "🏎️", name: "Racing" },
            { id: "sport_target", emoji: "🎯", name: "Target" },
            { id: "sport_bowling", emoji: "🎳", name: "Bowling" },
            { id: "sport_pool", emoji: "🎱", name: "Pool" },
            { id: "sport_chess", emoji: "♟️", name: "Chess" },
            { id: "sport_dice", emoji: "🎲", name: "Game Die" },
            { id: "sport_cards", emoji: "🃏", name: "Joker Card" },
        ]
    },

    // =========================================================================
    // GAMING
    // =========================================================================
    gaming: {
        name: "Gaming",
        icon: "🎮",
        avatars: [
            { id: "game_controller", emoji: "🎮", name: "Controller" },
            { id: "game_joystick", emoji: "🕹️", name: "Joystick" },
            { id: "game_dice", emoji: "🎲", name: "Dice" },
            { id: "game_chess", emoji: "♟️", name: "Chess Pawn" },
            { id: "game_cards", emoji: "🃏", name: "Joker" },
            { id: "game_spades", emoji: "♠️", name: "Spades" },
            { id: "game_hearts", emoji: "♥️", name: "Hearts" },
            { id: "game_diamonds", emoji: "♦️", name: "Diamonds" },
            { id: "game_clubs", emoji: "♣️", name: "Clubs" },
            { id: "game_mahjong", emoji: "🀄", name: "Mahjong" },
            { id: "game_pool", emoji: "🎱", name: "8-Ball" },
            { id: "game_target", emoji: "🎯", name: "Bullseye" },
            { id: "game_slot", emoji: "🎰", name: "Slot Machine" },
            { id: "game_puzzle", emoji: "🧩", name: "Puzzle" },
            { id: "game_teddy", emoji: "🧸", name: "Teddy Bear" },
            { id: "game_pinata", emoji: "🪅", name: "Piñata" },
            { id: "game_yoyo", emoji: "🪀", name: "Yo-Yo" },
            { id: "game_kite", emoji: "🪁", name: "Kite" },
            { id: "game_video", emoji: "📺", name: "TV" },
            { id: "game_trophy", emoji: "🏆", name: "Trophy" },
        ]
    },

    // =========================================================================
    // NATURE
    // =========================================================================
    nature: {
        name: "Nature",
        icon: "🌿",
        avatars: [
            { id: "nature_tree", emoji: "🌳", name: "Tree" },
            { id: "nature_palm", emoji: "🌴", name: "Palm Tree" },
            { id: "nature_cactus", emoji: "🌵", name: "Cactus" },
            { id: "nature_herb", emoji: "🌿", name: "Herb" },
            { id: "nature_four_leaf", emoji: "🍀", name: "Four Leaf Clover" },
            { id: "nature_maple", emoji: "🍁", name: "Maple Leaf" },
            { id: "nature_fallen", emoji: "🍂", name: "Fallen Leaf" },
            { id: "nature_flower_rose", emoji: "🌹", name: "Rose" },
            { id: "nature_flower_tulip", emoji: "🌷", name: "Tulip" },
            { id: "nature_flower_blossom", emoji: "🌸", name: "Cherry Blossom" },
            { id: "nature_flower_hibiscus", emoji: "🌺", name: "Hibiscus" },
            { id: "nature_sunflower", emoji: "🌻", name: "Sunflower" },
            { id: "nature_lotus", emoji: "🪷", name: "Lotus" },
            { id: "nature_sun", emoji: "🌞", name: "Sun Face" },
            { id: "nature_moon_face", emoji: "🌝", name: "Moon Face" },
            { id: "nature_rainbow", emoji: "🌈", name: "Rainbow" },
            { id: "nature_cloud", emoji: "☁️", name: "Cloud" },
            { id: "nature_rain", emoji: "🌧️", name: "Rain" },
            { id: "nature_snow", emoji: "❄️", name: "Snowflake" },
            { id: "nature_lightning", emoji: "⚡", name: "Lightning" },
            { id: "nature_fire", emoji: "🔥", name: "Fire" },
            { id: "nature_wave", emoji: "🌊", name: "Wave" },
            { id: "nature_mountain", emoji: "🏔️", name: "Mountain" },
            { id: "nature_volcano", emoji: "🌋", name: "Volcano" },
            { id: "nature_camping", emoji: "🏕️", name: "Camping" },
            { id: "nature_beach", emoji: "🏖️", name: "Beach" },
            { id: "nature_island", emoji: "🏝️", name: "Island" },
        ]
    },

    // =========================================================================
    // OBJECTS
    // =========================================================================
    objects: {
        name: "Objects",
        icon: "💡",
        avatars: [
            { id: "obj_lightbulb", emoji: "💡", name: "Light Bulb" },
            { id: "obj_flashlight", emoji: "🔦", name: "Flashlight" },
            { id: "obj_candle", emoji: "🕯️", name: "Candle" },
            { id: "obj_bomb", emoji: "💣", name: "Bomb" },
            { id: "obj_firecracker", emoji: "🧨", name: "Firecracker" },
            { id: "obj_money", emoji: "💰", name: "Money Bag" },
            { id: "obj_gem", emoji: "💎", name: "Gem" },
            { id: "obj_crown", emoji: "👑", name: "Crown" },
            { id: "obj_key", emoji: "🔑", name: "Key" },
            { id: "obj_lock", emoji: "🔒", name: "Lock" },
            { id: "obj_bell", emoji: "🔔", name: "Bell" },
            { id: "obj_hourglass", emoji: "⏳", name: "Hourglass" },
            { id: "obj_compass", emoji: "🧭", name: "Compass" },
            { id: "obj_magnet", emoji: "🧲", name: "Magnet" },
            { id: "obj_battery", emoji: "🔋", name: "Battery" },
            { id: "obj_gear", emoji: "⚙️", name: "Gear" },
            { id: "obj_wrench", emoji: "🔧", name: "Wrench" },
            { id: "obj_hammer", emoji: "🔨", name: "Hammer" },
            { id: "obj_axe", emoji: "🪓", name: "Axe" },
            { id: "obj_shield", emoji: "🛡️", name: "Shield" },
            { id: "obj_sword", emoji: "⚔️", name: "Swords" },
            { id: "obj_bow", emoji: "🏹", name: "Bow & Arrow" },
        ]
    },

    // =========================================================================
    // VEHICLES
    // =========================================================================
    vehicles: {
        name: "Vehicles",
        icon: "🚗",
        avatars: [
            { id: "vehicle_car", emoji: "🚗", name: "Car" },
            { id: "vehicle_taxi", emoji: "🚕", name: "Taxi" },
            { id: "vehicle_bus", emoji: "🚌", name: "Bus" },
            { id: "vehicle_truck", emoji: "🚚", name: "Truck" },
            { id: "vehicle_fire", emoji: "🚒", name: "Fire Truck" },
            { id: "vehicle_ambulance", emoji: "🚑", name: "Ambulance" },
            { id: "vehicle_police", emoji: "🚔", name: "Police Car" },
            { id: "vehicle_race", emoji: "🏎️", name: "Race Car" },
            { id: "vehicle_motorcycle", emoji: "🏍️", name: "Motorcycle" },
            { id: "vehicle_bike", emoji: "🚲", name: "Bicycle" },
            { id: "vehicle_scooter", emoji: "🛵", name: "Scooter" },
            { id: "vehicle_train", emoji: "🚂", name: "Train" },
            { id: "vehicle_metro", emoji: "🚇", name: "Metro" },
            { id: "vehicle_tram", emoji: "🚃", name: "Tram" },
            { id: "vehicle_plane", emoji: "✈️", name: "Airplane" },
            { id: "vehicle_helicopter", emoji: "🚁", name: "Helicopter" },
            { id: "vehicle_rocket", emoji: "🚀", name: "Rocket" },
            { id: "vehicle_ship", emoji: "🚢", name: "Ship" },
            { id: "vehicle_sailboat", emoji: "⛵", name: "Sailboat" },
            { id: "vehicle_speedboat", emoji: "🚤", name: "Speedboat" },
            { id: "vehicle_canoe", emoji: "🛶", name: "Canoe" },
            { id: "vehicle_anchor", emoji: "⚓", name: "Anchor" },
        ]
    }
};

// Total avatar count
const TOTAL_AVATARS = Object.values(AVATAR_CATALOG).reduce(
    (sum, cat) => sum + cat.avatars.length, 0
);

// Helper functions
function getAvatarById(avatarId) {
    for (const category of Object.values(AVATAR_CATALOG)) {
        const avatar = category.avatars.find(a => a.id === avatarId);
        if (avatar) return avatar;
    }
    return { id: avatarId, emoji: "👤", name: "Unknown" };
}

function getAvatarEmoji(avatarId) {
    return getAvatarById(avatarId).emoji;
}

function getAllAvatars() {
    const all = [];
    for (const [catId, category] of Object.entries(AVATAR_CATALOG)) {
        for (const avatar of category.avatars) {
            all.push({
                ...avatar,
                category: catId,
                categoryName: category.name
            });
        }
    }
    return all;
}

function searchAvatars(query) {
    const q = query.toLowerCase();
    return getAllAvatars().filter(a => 
        a.name.toLowerCase().includes(q) ||
        a.categoryName.toLowerCase().includes(q)
    );
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AVATAR_CATALOG, getAvatarById, getAvatarEmoji, getAllAvatars, searchAvatars, TOTAL_AVATARS };
}

console.log(`[Avatar Catalog] Loaded ${TOTAL_AVATARS} avatars across ${Object.keys(AVATAR_CATALOG).length} categories`);
