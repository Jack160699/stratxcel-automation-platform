/**
 * Fine-Grained Industry & Niche Research Taxonomy (Mission G §4–§5)
 *
 * Provides deep industry intelligence that fundamentally steers the content strategy:
 * - Distinguishes granular sub-niches (family dining vs café vs cloud kitchen; dental vs dermatology; CrossFit vs yoga; etc.)
 * - Codifies research-backed Engagement, Conversion, Trust, Education, and Authority drivers for each niche
 * - Provides tailored visual vocabulary, authentic photography styles, and realistic CTAs
 */

export type IndustryCategory =
  | "restaurant"
  | "salon"
  | "gym"
  | "clinic"
  | "retail"
  | "real_estate"
  | "local_service"
  | "saas"
  | "generic";

export type SubNicheCategory =
  | "restaurant_family"
  | "restaurant_cafe"
  | "restaurant_cloud_kitchen"
  | "restaurant_regional"
  | "restaurant_bakery"
  | "salon_hair_beauty"
  | "salon_spa_wellness"
  | "salon_aesthetics_skin"
  | "gym_commercial"
  | "gym_crossfit_hiit"
  | "gym_yoga_pilates"
  | "clinic_dental"
  | "clinic_dermatology"
  | "clinic_physiotherapy"
  | "clinic_general_pediatric"
  | "retail_fashion_boutique"
  | "retail_specialty_grocery"
  | "retail_home_decor"
  | "real_estate_residential"
  | "real_estate_commercial"
  | "service_plumbing_hvac"
  | "service_interior_design"
  | "service_professional_legal_ca"
  | "service_automotive"
  | "saas_platform"
  | "generic_business";

export interface NicheResearchDrivers {
  subNiche: SubNicheCategory;
  displayName: string;
  parentCategory: IndustryCategory;
  keywords: string[];
  engagementTriggers: string[];
  conversionTriggers: string[];
  trustBuilders: string[];
  educationTopics: string[];
  authorityDemonstrations: string[];
  sampleHooks: string[];
  visualDirection: string;
  ctaPhrasings: string[];
  relevanceVocabulary: string[];
}

export const NICHE_RESEARCH_PROFILES: Record<SubNicheCategory, NicheResearchDrivers> = {
  restaurant_family: {
    subNiche: "restaurant_family",
    displayName: "Family & Casual Dining Restaurant",
    parentCategory: "restaurant",
    keywords: ["restaurant", "family restaurant", "italian restaurant", "dining", "thali", "buffet", "casual dining", "eatery", "multi-cuisine", "tandoor", "veg restaurant", "pasta", "food", "cuisine"],
    engagementTriggers: ["Weekend dinner debates", "Signature comfort food polls", "Family feast memories", "Chef secret spice reveal"],
    conversionTriggers: ["Table reservation for weekend gatherings", "Sunday family brunch specials", "Large party booking"],
    trustBuilders: ["Kitchen cleanliness & fresh daily ingredient sourcing", "Founder recipe heritage", "Consistent portion sizing"],
    educationTopics: ["How slow-cooking develops flavor", "Why fresh ground spices change a curry", "Pairing dishes for a complete group meal"],
    authorityDemonstrations: ["Chef technique in tandoor cooking", "Heritage recipes preserved for decades"],
    sampleHooks: [
      "The one dish our regulars order before even opening the menu.",
      "Why we still grind our spice blends fresh every single morning.",
      "Planning a family dinner this weekend? Here is how to order for the whole table.",
    ],
    visualDirection: "Rich, appetizing overhead and 45-degree angle food photography with steam, fresh garnishes, and warm communal dining atmosphere",
    ctaPhrasings: ["Reserve your family table", "Visit us for lunch today", "Call for table reservations"],
    relevanceVocabulary: ["curry", "tandoor", "thali", "gravy", "spice", "fresh", "platter", "aroma", "slow-cooked", "family dinner", "table booking", "chef recipe"],
  },
  restaurant_cafe: {
    subNiche: "restaurant_cafe",
    displayName: "Artisanal Café & Coffee Roastery",
    parentCategory: "restaurant",
    keywords: ["cafe", "café", "coffee", "espresso", "roastery", "artisan bakery", "brunch", "matcha", "sourdough", "co-working cafe"],
    engagementTriggers: ["Pour-over vs espresso brew debates", "Best work-friendly coffee spots", "Morning ritual aesthetic"],
    conversionTriggers: ["Morning brew takeaway", "Weekend brunch table walk-in", "Specialty bean bag purchase"],
    trustBuilders: ["Single-origin bean traceability", "Barista calibration rituals", "Fresh daily pastry baking"],
    educationTopics: ["Why coffee grind size alters extraction taste", "Tasting notes: fruity vs chocolatey roasts", "How to brew cafe-quality coffee at home"],
    authorityDemonstrations: ["Barista milk steaming microfoam technique", "Cupping notes and bean origin profiles"],
    sampleHooks: [
      "The difference between a bitter espresso and a balanced one comes down to 4 seconds.",
      "Your morning coffee ritual deserves better than burnt beans.",
      "The perfect work-from-cafe setup: high-speed Wi-Fi, quiet corners, and fresh pour-overs.",
    ],
    visualDirection: "Clean editorial coffee photography with crisp morning light, latte art microfoam, textured wooden tables, and minimal clutter",
    ctaPhrasings: ["Grab your morning cup", "Drop in for brunch", "Try our single-origin roast today"],
    relevanceVocabulary: ["espresso", "pour-over", "roast", "barista", "latte", "sourdough", "beans", "extraction", "crema", "brunch", "brew"],
  },
  restaurant_cloud_kitchen: {
    subNiche: "restaurant_cloud_kitchen",
    displayName: "Delivery-First & Cloud Kitchen",
    parentCategory: "restaurant",
    keywords: ["cloud kitchen", "delivery", "takeaway", "biryani", "bowl", "roll", "online food", "dark kitchen"],
    engagementTriggers: ["Late-night cravings craving polls", "Best work-from-home lunch combos", "Portion size unpacking"],
    conversionTriggers: ["Direct delivery discount ordering", "Lunch box pre-orders", "Weekend match-night party packs"],
    trustBuilders: ["Tamper-evident hygiene packaging", "Temperature-controlled delivery packs", "Real-time kitchen prep hygiene"],
    educationTopics: ["How thermal packaging keeps biryani dum hot", "Why we package curries and rice separately"],
    authorityDemonstrations: ["Commercial-grade hygiene certification", "Consistent weight and portion measurement"],
    sampleHooks: [
      "Hot, fragrant biryani delivered with zero spill: here is how we pack it.",
      "Tired of soggy delivery fries? We changed our packaging to solve that.",
      "The ultimate 15-minute desk lunch that does not put you to sleep.",
    ],
    visualDirection: "Vibrant, clean delivery packaging presentation, steaming hot meal unboxing, and rich texture shots",
    ctaPhrasings: ["Order direct for fast delivery", "Order now on our direct link", "Tap to order your lunch box"],
    relevanceVocabulary: ["delivery", "packaging", "hot", "fresh", "portion", "combo", "biryani", "lunch bowl", "order online", "takeaway"],
  },
  restaurant_regional: {
    subNiche: "restaurant_regional",
    displayName: "Regional & Authentic Specialty Cuisine",
    parentCategory: "restaurant",
    keywords: ["south indian", "north indian", "chettinad", "bengali", "mughlai", "coastal", "kerala", "gujarati", "rajasthani", "authentic"],
    engagementTriggers: ["Regional dish nostalgia", "Authentic spice blend debates", "Traditional eating customs"],
    conversionTriggers: ["Weekend regional feast booking", "Special festival thali availability"],
    trustBuilders: ["Sourcing native ingredients directly from regional growers", "Traditional brass/earthenware cooking methods"],
    educationTopics: ["Why stone-ground spices taste different", "The story behind this 100-year-old regional recipe"],
    authorityDemonstrations: ["Mastering the art of traditional slow-dum or tempering (tadka)"],
    sampleHooks: [
      "If your curry doesn't use cold-pressed mustard oil, it's not truly authentic.",
      "The secret to our sambar? We roast every whole spice by hand.",
      "Why traditional cookware brings out flavors modern non-stick pans simply can't.",
    ],
    visualDirection: "Authentic earthenware and brass plating, rich natural colors, traditional textures and fresh leaf presentations",
    ctaPhrasings: ["Taste the authentic heritage", "Book your regional feast", "Visit us for authentic dining"],
    relevanceVocabulary: ["authentic", "heritage", "traditional", "tadka", "stone-ground", "native", "flavor", "sambar", "dum", "regional"],
  },
  restaurant_bakery: {
    subNiche: "restaurant_bakery",
    displayName: "Artisanal Bakery & Patisserie",
    parentCategory: "restaurant",
    keywords: ["bakery", "patisserie", "cake", "pastry", "sourdough", "croissant", "dessert", "custom cakes"],
    engagementTriggers: ["Sourdough crust crunch sounds", "Custom cake decoration time-lapses", "Sweet vs savory debates"],
    conversionTriggers: ["Pre-ordering custom celebration cakes", "Morning croissant batch pickup", "Afternoon tea pastry box"],
    trustBuilders: ["100% pure butter and no artificial vegetable fats", "24-hour wild ferment sourdough process"],
    educationTopics: ["Why real laminated croissants take 3 days to make", "How to store artisanal bread so it stays crusty"],
    authorityDemonstrations: ["Pastry lamination layers and tempering chocolate"],
    sampleHooks: [
      "72 hours, 27 layers of French butter: the making of a real croissant.",
      "Why our sourdough only uses three ingredients: flour, water, and sea salt.",
      "Planning a birthday? Here is how early you should book a custom designer cake.",
    ],
    visualDirection: "High-detail macro shots of flaky pastry layers, glossy cake glazes, dusted flour on wooden peels, and natural warm lighting",
    ctaPhrasings: ["Pre-order your celebration cake", "Pick up fresh morning bakes", "Order a pastry box"],
    relevanceVocabulary: ["sourdough", "croissant", "butter", "crust", "crumb", "layers", "custom cake", "pastry", "baked fresh", "patisserie"],
  },
  salon_hair_beauty: {
    subNiche: "salon_hair_beauty",
    displayName: "Hair & Beauty Salon",
    parentCategory: "salon",
    keywords: ["salon", "unisex salon", "hair salon", "beauty salon", "haircut", "hair color", "balayage", "keratin", "bridal makeup", "styling", "barbershop"],
    engagementTriggers: ["Hair transformation before/afters", "Balayage shade matching guides", "Hairstyle for face shape tips"],
    conversionTriggers: ["Hair consultation booking", "Bridal package inquiries", "Weekend slot availability"],
    trustBuilders: ["Premium brand product line transparency (Olaplex, L'Oreal Pro)", "Sterilized tools and consultation-first approach"],
    educationTopics: ["How to maintain your hair color after washing", "Why box dye damages hair compared to professional toning"],
    authorityDemonstrations: ["Color formulation matching skin undertones and precision cutting"],
    sampleHooks: [
      "The biggest mistake people make in the first 48 hours after coloring their hair.",
      "Balayage vs highlights: which one actually grows out without harsh lines?",
      "Before you book that dramatic haircut, ask your stylist these 3 questions.",
    ],
    visualDirection: "Clean, well-lit hair movement shots showing shine, realistic texture and dimensional color tones without heavy filters",
    ctaPhrasings: ["Book your hair consultation", "Reserve your stylist slot", "DM to check weekend availability"],
    relevanceVocabulary: ["balayage", "color", "cut", "keratin", "stylist", "texture", "shine", "undertone", "consultation", "appointment"],
  },
  salon_spa_wellness: {
    subNiche: "salon_spa_wellness",
    displayName: "Day Spa & Wellness Center",
    parentCategory: "salon",
    keywords: ["spa", "massage", "wellness", "aromatherapy", "body scrub", "ayurvedic spa", "relaxation", "reflexology"],
    engagementTriggers: ["Stress-relief self-care reminders", "Aromatherapy oil benefits", "Weekend detox ideas"],
    conversionTriggers: ["Couple spa package booking", "Weekday relaxation discount slots", "Gift card purchase"],
    trustBuilders: ["Organic essential oils without mineral oil fillers", "Certified therapists and private hygienic suites"],
    educationTopics: ["Deep tissue vs Swedish massage: which one eases lower back tension?", "How lymphatic drainage reduces bloating"],
    authorityDemonstrations: ["Therapeutic pressure-point release and posture alignment benefits"],
    sampleHooks: [
      "Your shoulders are probably tense right now. Here is what an hour of deep tissue work does.",
      "The difference between feeling relaxed and actually releasing chronic muscle knots.",
      "Why self-care isn't a luxury when your work week is demanding.",
    ],
    visualDirection: "Calm, ambient spa aesthetics with soft lighting, natural stone, rolled warm towels, botanicals, and serene minimalism",
    ctaPhrasings: ["Book your relaxation session", "Schedule your spa getaway", "Inquire about wellness packages"],
    relevanceVocabulary: ["massage", "spa", "aromatherapy", "relaxation", "deep tissue", "wellness", "therapist", "essential oils", "rejuvenate"],
  },
  salon_aesthetics_skin: {
    subNiche: "salon_aesthetics_skin",
    displayName: "Skin Aesthetics & Facial Clinic",
    parentCategory: "salon",
    keywords: ["skin aesthetic", "hydrafacial", "chemical peel", "laser hair removal", "anti-aging", "glow facial", "dermal"],
    engagementTriggers: ["Glass skin routine breakdowns", "Acne scar treatment myth-busting", "Sunscreen application tests"],
    conversionTriggers: ["Skin analysis booking", "HydraFacial first-session offer", "Treatment package plan"],
    trustBuilders: ["Medical-grade equipment certification", "Patch-test and barrier-health-first protocols"],
    educationTopics: ["Why scrubbing active acne damages your skin barrier", "What happens during a medical-grade HydraFacial"],
    authorityDemonstrations: ["Skin barrier diagnostics and customized active ingredient layering"],
    sampleHooks: [
      "No amount of expensive serum will work if your skin barrier is compromised.",
      "What a HydraFacial actually does to clogged pores under 10x magnification.",
      "The one skincare step 90% of people skip during seasonal weather changes.",
    ],
    visualDirection: "Bright, clinical yet soothing aesthetics, close-up clean skin texture, sterile aesthetic equipment and fresh natural glow",
    ctaPhrasings: ["Book a detailed skin consultation", "Schedule your HydraFacial", "DM for customized skin plans"],
    relevanceVocabulary: ["hydrafacial", "skin barrier", "glow", "aesthetician", "pores", "treatment", "peel", "pigmentation", "collagen"],
  },
  gym_commercial: {
    subNiche: "gym_commercial",
    displayName: "Strength & Commercial Fitness Gym",
    parentCategory: "gym",
    keywords: ["gym", "fitness center", "weight training", "bodybuilding", "cardio", "gym membership", "personal training"],
    engagementTriggers: ["Gym motivation form checks", "Bench press and squat posture breakdowns", "Workout playlist energy"],
    conversionTriggers: ["Free 1-day trial workout pass", "Annual membership discount", "Personal trainer intro package"],
    trustBuilders: ["Certified trainers on the floor at all times", "Sanitized free-weights and international equipment (Hammer Strength, Life Fitness)"],
    educationTopics: ["Why progressive overload builds muscle faster than switching exercises daily", "How to calculate your daily protein target"],
    authorityDemonstrations: ["Trainer biomechanics cueing and injury prevention form tips"],
    sampleHooks: [
      "Stop changing your workout routine every week. Here is why progressive overload works.",
      "If your lower back hurts during deadlifts, check these two foot placement cues.",
      "Looking for a gym where you never have to queue for a squat rack?",
    ],
    visualDirection: "Dynamic, focused athletic photography with dramatic directional lighting, real exertion, chalk, iron weights and clean gym floor",
    ctaPhrasings: ["Claim your free trial pass", "Join today with zero joining fee", "Book a trainer consultation"],
    relevanceVocabulary: ["workout", "strength", "reps", "trainer", "muscle", "deadlift", "squat", "membership", "form", "protein", "fitness"],
  },
  gym_crossfit_hiit: {
    subNiche: "gym_crossfit_hiit",
    displayName: "CrossFit Box & Functional Fitness",
    parentCategory: "gym",
    keywords: ["crossfit", "hiit", "functional training", "wod", "kettlebell", "calisthenics", "bootcamp", "olympic lifting"],
    engagementTriggers: ["WOD score achievements", "Community PR celebrations", "Kettlebell swing technique breakdowns"],
    conversionTriggers: ["On-ramp beginner session sign-up", "Saturday community workout drop-in"],
    trustBuilders: ["Scaled workouts for all fitness levels", "Level-2 certified coaches watching every lift"],
    educationTopics: ["Why functional movements protect your joints in daily life", "How scaling workouts prevents burnout and injury"],
    authorityDemonstrations: ["Olympic weightlifting bar path and gymnastics kip form"],
    sampleHooks: [
      "Think CrossFit is only for elite athletes? Here is how our beginner On-Ramp actually works.",
      "The single best exercise for core stability that isn't a sit-up.",
      "Community isn't just a buzzword here — it's why you finish the last 5 reps.",
    ],
    visualDirection: "High-energy, gritty action photography with barbell drops, chalk dust, kettlebells, and authentic group camaraderie",
    ctaPhrasings: ["Drop in for a trial class", "Sign up for beginner On-Ramp", "Join our Saturday community WOD"],
    relevanceVocabulary: ["crossfit", "wod", "kettlebell", "barbell", "coach", "functional", "stamina", "community", "scale", "mobility"],
  },
  gym_yoga_pilates: {
    subNiche: "gym_yoga_pilates",
    displayName: "Yoga & Reformer Pilates Studio",
    parentCategory: "gym",
    keywords: ["yoga", "pilates", "reformer", "vinyasa", "ashtanga", "mindfulness", "breathwork", "mat pilates", "flexibility", "mobility"],
    engagementTriggers: ["Morning mobility flows", "Core stability reformer checks", "Mindful breathing tips"],
    conversionTriggers: ["Reformer intro class pass", "Monthly unlimited mat pass", "Weekend restorative workshop"],
    trustBuilders: ["Small class sizes capped at 8 for individual posture adjustment", "Anatomy-trained certified instructors"],
    educationTopics: ["How reformer spring resistance builds deep stabilizer muscles", "Why breath rhythm controls nervous system recovery"],
    authorityDemonstrations: ["Pelvic alignment cues and restorative yoga progressions"],
    sampleHooks: [
      "Why Reformer Pilates works muscles you didn't even know existed.",
      "Tight hips from sitting all day? Try these 3 gentle mobility holds.",
      "Strength without heavy weights: the power of controlled spring resistance.",
    ],
    visualDirection: "Serene, beautifully lit studio spaces with polished wood, clean lines, reformer equipment and mindful posture alignment",
    ctaPhrasings: ["Book your intro reformer class", "Reserve your yoga mat", "View class schedule"],
    relevanceVocabulary: ["pilates", "reformer", "yoga", "mobility", "posture", "alignment", "breath", "flexibility", "core", "mindful"],
  },
  clinic_dental: {
    subNiche: "clinic_dental",
    displayName: "Dental & Orthodontic Clinic",
    parentCategory: "clinic",
    keywords: ["dentist", "dental", "dental clinic", "invisalign", "aligner", "aligners", "teeth", "tooth", "teeth whitening", "root canal", "braces", "implant", "implants", "smile makeover", "oral"],
    engagementTriggers: ["Clear aligner transformation timelines", "Enamel-safe teeth whitening tips", "Dental hygiene myth-busting"],
    conversionTriggers: ["Free smile alignment consultation", "Same-day emergency appointment", "Routine dental cleaning booking"],
    trustBuilders: ["Pain-free anesthesia protocols", "Autoclave hospital-grade sterilization transparency", "Digital 3D intraoral scanning"],
    educationTopics: ["Why bleeding gums are a warning sign, not normal", "Clear aligners vs traditional metal braces", "How a simple night guard prevents tooth grinding damage"],
    authorityDemonstrations: ["Digital smile design simulations and precision root canal imaging"],
    sampleHooks: [
      "Bleeding when you brush isn't just irritation — it's the first stage of gum disease.",
      "Clear aligners vs traditional braces: what they don't tell you about daily maintenance.",
      "Afraid of dental visits? Here is how modern painless dentistry actually works.",
    ],
    visualDirection: "Bright, immaculate dental clinical setup with calm lighting, high-tech digital 3D scanners, and reassuring professional practitioner presence",
    ctaPhrasings: ["Book your dental check-up", "Schedule your smile consultation", "Call for emergency dental care"],
    relevanceVocabulary: ["dentist", "smile", "aligners", "teeth", "hygiene", "enamel", "cleaning", "consultation", "painless", "implants", "orthodontic"],
  },
  clinic_dermatology: {
    subNiche: "clinic_dermatology",
    displayName: "Medical & Cosmetic Dermatology Clinic",
    parentCategory: "clinic",
    keywords: ["dermatologist", "dermatology", "skin clinic", "laser treatment", "hair loss", "prp", "acne", "scars", "pigmentation", "botox", "fillers", "skincare"],
    engagementTriggers: ["Active ingredient ingredient compatibility", "Sunscreen SPF truth checks", "Hair thinning diagnostic stages"],
    conversionTriggers: ["Doctor-led skin diagnosis appointment", "PRP hair loss consultation", "Pigmentation treatment roadmap"],
    trustBuilders: ["Board-certified MD dermatologists only (no generic salon operators)", "Evidence-based clinical protocols with FDA-cleared devices"],
    educationTopics: ["Why DIY home remedies make stubborn melasma darker", "The real science behind PRP for early-stage hair thinning", "Retinoids vs Vitamin C: how to alternate without irritation"],
    authorityDemonstrations: ["Trichoscopy hair analysis and clinical peel depth management"],
    sampleHooks: [
      "Using lemon juice or baking soda on acne? Here is the chemical damage you're doing to your skin.",
      "Hair shedding vs permanent hair loss: how to tell which one you have.",
      "Melasma won't go away with random creams — here is the clinical approach that actually works.",
    ],
    visualDirection: "Sophisticated medical aesthetic environment with doctor consultations, dermatoscopes, clinical lighting and genuine skin texture",
    ctaPhrasings: ["Consult our dermatologist", "Book your clinical skin assessment", "Schedule a hair loss consultation"],
    relevanceVocabulary: ["dermatologist", "acne", "pigmentation", "melasma", "hair loss", "prp", "clinical", "skin barrier", "retinoid", "consultation"],
  },
  clinic_physiotherapy: {
    subNiche: "clinic_physiotherapy",
    displayName: "Physiotherapy & Sports Rehab Clinic",
    parentCategory: "clinic",
    keywords: ["physiotherapy", "physio", "physical therapy", "sports rehab", "back pain", "knee rehabilitation", "ergonomics", "dry needling", "chiropractic", "rehab"],
    engagementTriggers: ["Desk posture correction drills", "Sciatica relief stretches", "Knee joint mobility tests"],
    conversionTriggers: ["Initial pain assessment booking", "Post-surgery rehab package", "Ergonomic workspace assessment"],
    trustBuilders: ["Root-cause movement assessment instead of temporary symptom numbing", "Customized exercise rehabilitation plans"],
    educationTopics: ["Why resting in bed actually delays lower back pain recovery", "How weak glutes cause anterior knee pain when walking down stairs"],
    authorityDemonstrations: ["Gait analysis, manual therapy mobilization, and neuromuscular re-education"],
    sampleHooks: [
      "Resting in bed for lower back pain? Research shows movement heals it 3x faster.",
      "If you work at a desk for 8 hours, this 60-second hip mobility drill is non-negotiable.",
      "Knee pain when going down stairs usually isn't a knee problem — check your hips.",
    ],
    visualDirection: "Active rehabilitation clinic with resistance bands, posture grids, mobilization tables, and empathetic hands-on physical therapy guidance",
    ctaPhrasings: ["Book a pain assessment", "Start your rehab plan", "Consult a physical therapist"],
    relevanceVocabulary: ["physiotherapy", "rehabilitation", "posture", "back pain", "mobility", "joint", "exercises", "recovery", "assessment", "ergonomics"],
  },
  clinic_general_pediatric: {
    subNiche: "clinic_general_pediatric",
    displayName: "Pediatric & Family Healthcare Clinic",
    parentCategory: "clinic",
    keywords: ["pediatrician", "pediatric", "pediatrics", "family doctor", "child clinic", "vaccination", "general physician", "child care", "health checkup", "toddler"],
    engagementTriggers: ["Seasonal flu prevention for kids", "Vaccination milestone guides", "Nutrition tips for toddlers"],
    conversionTriggers: ["Vaccination schedule booking", "Routine growth milestone assessment", "Same-day child fever consultation"],
    trustBuilders: ["Child-friendly calming environment", "Gentle, non-intimidating doctors and clean waiting rooms"],
    educationTopics: ["When a child's fever requires urgent care vs home hydration", "Managing seasonal allergic coughs without over-medicating"],
    authorityDemonstrations: ["Growth chart percentile tracking and pediatric developmental assessments"],
    sampleHooks: [
      "When is a toddler's fever an emergency, and when is home care enough? A pediatrician's guide.",
      "The essential vaccination checklist every parent should keep handy this season.",
      "How to build stronger childhood immunity without relying on unnecessary supplements.",
    ],
    visualDirection: "Warm, gentle, family-friendly medical clinic with natural light, pediatric measuring charts, and comforting doctor-patient interactions",
    ctaPhrasings: ["Book a pediatric consultation", "Schedule child vaccination", "Call for general physician appointment"],
    relevanceVocabulary: ["pediatrician", "child health", "vaccination", "growth", "fever", "family doctor", "immunity", "consultation", "wellness"],
  },
  retail_fashion_boutique: {
    subNiche: "retail_fashion_boutique",
    displayName: "Fashion Boutique & Designer Apparel",
    parentCategory: "retail",
    keywords: ["retail", "store", "shop", "electronics", "boutique", "designer", "ethnic wear", "saree", "kurti", "western wear", "handloom", "sustainable fashion", "clothing store", "apparel"],
    engagementTriggers: ["Styling one piece three ways", "Handloom fabric weaving stories", "Festive capsule wardrobe edits"],
    conversionTriggers: ["New collection arrival in-store visit", "Direct WhatsApp ordering with doorstep delivery", "Custom sizing consultation"],
    trustBuilders: ["Pure natural fabrics (pure silk, linen, handloom cotton)", "Handcrafted artisan embroidery and bespoke tailoring"],
    educationTopics: ["How to identify real handloom weaves from synthetic prints", "Care instructions to preserve pure silk sarees for generations"],
    authorityDemonstrations: ["Fabric draping techniques and color theory styling for festive events"],
    sampleHooks: [
      "One handloom kurta, styled three completely different ways: work, casual, and festive.",
      "How to spot pure mulberry silk in under 10 seconds before buying.",
      "Our festive capsule collection just dropped — and each piece is limited to only 15 units.",
    ],
    visualDirection: "Editorial fashion photography showcasing rich fabric drape, intricate embroidery macro details, natural daylight, and elegant model styling",
    ctaPhrasings: ["Shop the new collection", "Visit our boutique store", "WhatsApp us to order your size"],
    relevanceVocabulary: ["handloom", "silk", "saree", "kurta", "outfit", "collection", "styling", "fabric", "boutique", "drape", "designer"],
  },
  retail_specialty_grocery: {
    subNiche: "retail_specialty_grocery",
    displayName: "Organic & Specialty Gourmet Grocery",
    parentCategory: "retail",
    keywords: ["organic", "grocery", "gourmet", "dry fruits", "spices", "cold pressed oil", "artisanal cheese", "health food"],
    engagementTriggers: ["Label reading: hidden additives in everyday foods", "Farm-to-shelf journey videos", "Healthy recipe swaps"],
    conversionTriggers: ["Weekly organic basket subscription", "Weekend store tasting walk-in", "Same-day doorstep delivery"],
    trustBuilders: ["Certified organic farm sourcing with batch lab reports", "Cold-pressed extraction without chemical refining"],
    educationTopics: ["Why cold-pressed wood-churned oils retain natural antioxidants", "Understanding chemical additives on packaged food labels"],
    authorityDemonstrations: ["Purity testing demonstrations and direct farmer partnership stories"],
    sampleHooks: [
      "Check your cooking oil bottle right now. If it says 'refined', here is what was stripped away.",
      "Why our organic honey crystallizes in winter — and why that's proof of 100% purity.",
      "Fresh farm harvest arrived this morning: crisp greens, heirloom tomatoes, and cold-pressed oils.",
    ],
    visualDirection: "Earthy, wholesome food photography with rustic wooden crates, vibrant fresh produce, amber glass bottles, and sunlit grocery aisles",
    ctaPhrasings: ["Order your organic basket", "Visit our store today", "Shop fresh harvest online"],
    relevanceVocabulary: ["organic", "cold-pressed", "pure", "farm-fresh", "spices", "gourmet", "antioxidants", "harvest", "healthy", "grocery"],
  },
  retail_home_decor: {
    subNiche: "retail_home_decor",
    displayName: "Home Decor & Artisanal Furnishings",
    parentCategory: "retail",
    keywords: ["home decor", "furniture", "furnishings", "ceramics", "lighting", "interior store", "handcrafted decor", "rugs"],
    engagementTriggers: ["Living room makeover room reveals", "Small space styling hacks", "Lighting temperature ambiance tests"],
    conversionTriggers: ["Showroom visit booking", "Custom upholstery and curtain consultation", "Festive home refresh shopping"],
    trustBuilders: ["Solid hardwood construction (teak, sheesham) with lifetime structural guarantees", "Handmade ceramic glaze safety"],
    educationTopics: ["How to choose the right rug size so your living room doesn't look smaller", "Warm vs cool lighting: where to use 2700K vs 4000K in your home"],
    authorityDemonstrations: ["Wood joinery craftsmanship and custom textile curation"],
    sampleHooks: [
      "The #1 mistake people make when buying a living room rug is choosing a size too small.",
      "How to make a compact room feel twice as large with 3 simple lighting tweaks.",
      "Hand-thrown ceramic tableware that turns every simple dinner into an occasion.",
    ],
    visualDirection: "Inviting, beautifully styled interior spaces with layered textures, warm ambient lighting, architectural accents and handcrafted details",
    ctaPhrasings: ["Explore our decor collection", "Visit our design showroom", "Shop handcrafted pieces online"],
    relevanceVocabulary: ["decor", "interior", "handcrafted", "ceramics", "furniture", "living room", "lighting", "textiles", "home styling", "aesthetic"],
  },
  real_estate_residential: {
    subNiche: "real_estate_residential",
    displayName: "Residential Real Estate & Premium Homes",
    parentCategory: "real_estate",
    keywords: ["real estate", "real estate developer", "property developer", "apartments", "villas", "flats", "gated community", "property", "realtor", "residential project", "bhk"],
    engagementTriggers: ["Home layout walkthrough polls", "Up-and-coming neighborhood infrastructure updates", "Balcony view appreciation"],
    conversionTriggers: ["Schedule a private site visit", "Download project floor plan & pricing sheet", "Pre-launch booking window"],
    trustBuilders: ["RERA registration transparency and clear title documentation", "Actual construction milestone photo updates"],
    educationTopics: ["What to verify before buying an under-construction property", "Carpet area vs super built-up area: calculating real usable space"],
    authorityDemonstrations: ["Location appreciation analysis and structural engineering standards"],
    sampleHooks: [
      "Carpet area vs super built-up area: how to calculate what you are actually paying for.",
      "Why this emerging neighborhood is seeing 14% annual infrastructure appreciation.",
      "Looking for a 3 BHK with zero wasted corridor space and uninterrupted skyline views?",
    ],
    visualDirection: "High-end architectural photography showcasing spacious interiors, natural sunlight flooding living rooms, landscaped amenities, and premium finishes",
    ctaPhrasings: ["Schedule your site visit", "Download floor plans", "Enquire for unit availability"],
    relevanceVocabulary: ["rera", "carpet area", "amenities", "bhk", "villa", "gated community", "site visit", "possession", "architecture", "investment"],
  },
  real_estate_commercial: {
    subNiche: "real_estate_commercial",
    displayName: "Commercial Real Estate & Office Spaces",
    parentCategory: "real_estate",
    keywords: ["commercial property", "office space", "retail shop for sale", "commercial lease", "business park", "warehouse"],
    engagementTriggers: ["High-street retail footfall analysis", "Grade-A office design trends", "Commercial rental yield comparisons"],
    conversionTriggers: ["Commercial lease proposal inquiry", "Investor preview booking", "Site inspection schedule"],
    trustBuilders: ["Lease stability and institutional-grade property management", "High-power backup and fire compliance certifications"],
    educationTopics: ["How commercial rental yields compare against residential properties", "Essential lease clauses every business owner must negotiate"],
    authorityDemonstrations: ["Footfall density mapping and micro-market commercial vacancy rate analysis"],
    sampleHooks: [
      "Why smart retail brands look at road frontage and parking before square footage.",
      "Commercial vs residential yields: where smart capital is deploying this quarter.",
      "Grade-A office space in a prime business corridor with direct metro connectivity.",
    ],
    visualDirection: "Crisp commercial architectural photography, sleek glass facades, modern corporate lobbies, and well-lit open-plan office layouts",
    ctaPhrasings: ["Schedule a commercial site tour", "Request leasing deck", "Enquire about prime retail spaces"],
    relevanceVocabulary: ["commercial", "office", "retail", "footfall", "lease", "rental yield", "business park", "investment", "location", "amenity"],
  },
  service_plumbing_hvac: {
    subNiche: "service_plumbing_hvac",
    displayName: "Plumbing, Electrical & HVAC Home Services",
    parentCategory: "local_service",
    keywords: ["local plumbing", "plumbing service", "plumbing", "plumber", "electrician", "electrical repair", "hvac", "ac repair", "waterproofing", "home repair", "leak detection", "geyser repair", "drain cleaning"],
    engagementTriggers: ["DIY repair mistakes to avoid", "Pre-monsoon leakage checklists", "Energy-saving AC setting tips"],
    conversionTriggers: ["Emergency same-day repair callout", "Seasonal AC servicing booking", "Waterproofing inspection booking"],
    trustBuilders: ["Upfront transparent rate card before touching any tool", "Background-verified licensed technicians with 90-day service warranty"],
    educationTopics: ["Why low water pressure is usually a hidden valve issue, not a faulty pump", "How a dirty AC filter increases your electricity bill by 15%"],
    authorityDemonstrations: ["Thermal imaging leak detection and professional pipe crimping techniques"],
    sampleHooks: [
      "That tiny water stain on your ceiling isn't going away — here is what is happening behind the plaster.",
      "Why your AC is blowing warm air (and how to fix it before paying for a compressor replacement).",
      "No hidden fees, no surprise bills: transparent pricing before any repair begins.",
    ],
    visualDirection: "Authentic on-the-job photography showing clean diagnostic tools, tidy work areas, uniformed technicians, and clear before/after repairs",
    ctaPhrasings: ["Book a same-day technician", "Call for emergency service", "Schedule your pre-season service"],
    relevanceVocabulary: ["repair", "technician", "leak", "plumbing", "ac service", "electrical", "warranty", "same-day", "inspection", "pricing"],
  },
  service_interior_design: {
    subNiche: "service_interior_design",
    displayName: "Interior Design & Architecture Studio",
    parentCategory: "local_service",
    keywords: ["interior designer", "interior architecture", "modular kitchen", "home renovation", "wardrobe design", "living room design"],
    engagementTriggers: ["Modular kitchen layout comparisons (L-shape vs Island)", "Material durability tests (acrylic vs laminate)", "Before/After 3D render vs reality"],
    conversionTriggers: ["Book a 1-on-1 design consultation", "Get an instant modular kitchen cost estimate", "Visit completed home tour"],
    trustBuilders: ["45-day guaranteed project handover timeline with penalty clauses", "10-year warranty on marine-grade plywood and Blum/Hettich hardware"],
    educationTopics: ["Why modular kitchen ergonomics depend on the 'kitchen work triangle'", "Laminate vs PU finish: which holds up better to daily Indian cooking?"],
    authorityDemonstrations: ["3D photorealistic walkthroughs and detailed MEP architectural drawings"],
    sampleHooks: [
      "The golden rule of kitchen design: if your sink, stove, and fridge aren't in a triangle, cooking feels exhausting.",
      "3D Render vs Actual Handover: how our designs translate to reality with millimeter accuracy.",
      "Planning a home renovation? Here is how to allocate your budget across woodwork, lighting, and finishes.",
    ],
    visualDirection: "Architectural digest quality interior photography showing clean joinery, balanced mood lighting, textured materials and functional elegance",
    ctaPhrasings: ["Book a design consultation", "Calculate your modular kitchen quote", "Explore our portfolio"],
    relevanceVocabulary: ["interior", "modular kitchen", "woodwork", "design", "renovation", "materials", "render", "hardware", "layout", "consultation"],
  },
  service_professional_legal_ca: {
    subNiche: "service_professional_legal_ca",
    displayName: "Chartered Accountancy, Legal & Business Advisory",
    parentCategory: "local_service",
    keywords: ["ca", "chartered accountant", "tax consultant", "gst filing", "legal", "lawyer", "company registration", "trademark", "compliance"],
    engagementTriggers: ["Tax deadline reminders", "Common GST input tax credit mistakes", "Company incorporation checklist"],
    conversionTriggers: ["Schedule tax planning consultation", "File annual ITR / GST return", "Trademark search & registration request"],
    trustBuilders: ["Certified professionals with years of regulatory experience", "Confidential data handling and proactive compliance tracking"],
    educationTopics: ["How legitimate business expenses reduce your tax liability without compliance risk", "The danger of operating without registered trademark protection"],
    authorityDemonstrations: ["Deciphering complex tax notifications and corporate compliance audits"],
    sampleHooks: [
      "The #1 mistake small businesses make with GST input tax credit that triggers tax notices.",
      "Starting a company? Why choosing between Private Limited and LLP depends on funding plans.",
      "Don't wait until the deadline week: here is your quarterly tax checklist.",
    ],
    visualDirection: "Clean, professional advisory environment with organized documents, client discussion tables, modern corporate aesthetics and calm clarity",
    ctaPhrasings: ["Consult our tax specialist", "Book a compliance audit", "Inquire about business registration"],
    relevanceVocabulary: ["tax", "gst", "compliance", "filing", "chartered accountant", "trademark", "audit", "advisory", "business", "legal"],
  },
  service_automotive: {
    subNiche: "service_automotive",
    displayName: "Automotive Detailing & Car Care Center",
    parentCategory: "local_service",
    keywords: ["car detailing", "ceramic coating", "ppf", "paint protection film", "car wash", "car service", "mechanic", "dent repair"],
    engagementTriggers: ["Ceramic coating water beading videos", "Swirl mark paint correction 50/50 tests", "PPF scratch healing demos"],
    conversionTriggers: ["Book paint protection consultation", "Reserve weekend deep detailing slot", "Get instant ceramic coating quote"],
    trustBuilders: ["Dust-free temperature-controlled detailing bays", "Certified PPF installers and genuine warranty cards"],
    educationTopics: ["Why automated brush car washes ruin your clear coat with swirl marks", "Ceramic coating vs PPF: which one actually stops stone chips?"],
    authorityDemonstrations: ["Paint depth gauge readings and multi-stage rotary machine polishing"],
    sampleHooks: [
      "Every time you let someone wipe your dusty car with a dry cloth, you are scratching the clear coat.",
      "Ceramic coating vs PPF: what actually protects against flying gravel and stone chips.",
      "Watch what 3-stage paint correction does to 5 years of swirl marks.",
    ],
    visualDirection: "High-contrast automotive detailing shots in studio lighting, extreme water beading, glossy reflections, and clean studio bays",
    ctaPhrasings: ["Book your detailing slot", "Get a paint protection quote", "DM for package details"],
    relevanceVocabulary: ["detailing", "ceramic coating", "ppf", "paint correction", "gloss", "car care", "scratch", "swirl marks", "protection", "car"],
  },
  saas_platform: {
    subNiche: "saas_platform",
    displayName: "SaaS Marketing & Business Automation Platform",
    parentCategory: "saas",
    // These keywords are checked BEFORE the generic_business keywords so a
    // SaaS description scores here instead of accidentally matching clinic/
    // salon terms via low-signal words like "business" or "local".
    keywords: [
      "saas", "software", "automation platform", "marketing platform", "marketing automation",
      "crm", "whatsapp automation", "lead generation software", "local business software",
      "digital marketing platform", "growth platform", "business software", "autopilot",
      "brand brain", "content automation", "social autopilot", "ai marketing",
      "stratxcel", "stratXcel", "marketing tool", "growth operations",
    ],
    engagementTriggers: [
      "Before/after: how a business owner's week changed after adopting automation",
      "The specific manual task this platform eliminates for real local business owners",
      "Real business owner reaction to seeing their social posts go live automatically",
    ],
    conversionTriggers: [
      "Free trial or demo request from a local business owner",
      "Specific ROI or time-saved metric from a real customer case study",
      "One-click signup for the autopilot content package",
    ],
    trustBuilders: [
      "Real customer names and business types using the platform",
      "Transparent pricing with no hidden fees",
      "Built specifically for India's local business context, not a generic US tool",
    ],
    educationTopics: [
      "Why local businesses lose customers who find them on Google but can't reach them on WhatsApp",
      "The 3 social posts every local business needs to run every month (and why most don't)",
      "How consistent social presence leads to real walk-in traffic, not just likes",
    ],
    authorityDemonstrations: [
      "A real business owner showing their dashboard with live automation running",
      "Time-lapse of 28 days of social posts planned, generated, and published hands-free",
    ],
    sampleHooks: [
      "A local restaurant owner in Bhilai gets 40+ new WhatsApp leads every month — here's what changed.",
      "The reason most local businesses have dead Instagram pages isn't laziness. It's time.",
      "You don't need a marketing team to show up on social media every day. Here's the actual alternative.",
    ],
    visualDirection: "Real local business owners at their own shops — not stock photo models — shown interacting with a phone or laptop displaying the platform's actual UI. Warm, documentary-style photography that feels lived-in and authentic, not polished corporate.",
    ctaPhrasings: [
      "See how it works for your business",
      "Start your free trial",
      "Book a 15-minute demo",
    ],
    relevanceVocabulary: [
      "autopilot", "automation", "local business", "social presence", "leads",
      "WhatsApp", "content", "brand", "growth", "platform", "dashboard", "campaign",
    ],
  },
  generic_business: {
    subNiche: "generic_business",
    displayName: "Local Commercial Enterprise",
    parentCategory: "generic",
    keywords: ["business", "company", "enterprise", "agency", "firm", "commercial"],
    engagementTriggers: ["Behind-the-scenes craft", "Customer problem solving", "Industry perspective"],
    conversionTriggers: ["Direct consultation", "Service inquiry", "Quote request"],
    trustBuilders: ["Transparent standards", "Customer satisfaction outcomes", "Local presence"],
    educationTopics: ["How to choose the right service provider", "Key quality indicators to check"],
    authorityDemonstrations: ["Expert execution process and thorough quality control"],
    sampleHooks: [
      "The standards we maintain behind the scenes make all the difference in the final result.",
      "Why transparent communication is our #1 principle for every customer project.",
      "Planning your next project? Here are the 3 essential questions to ask upfront.",
    ],
    visualDirection: "Authentic, high-clarity professional photography reflecting real service execution, genuine team craft, and clean environment",
    ctaPhrasings: ["Get in touch with our team", "Request a consultation", "Call us today"],
    relevanceVocabulary: ["service", "quality", "standards", "client", "team", "process", "consultation", "solution", "professional"],
  },
};

/**
 * Classifies an industry string into a fine-grained SubNicheCategory.
 */
export function classifySubNiche(industryText?: string | null, descriptionText?: string | null): SubNicheCategory {
  const combined = `${industryText ?? ""} ${descriptionText ?? ""}`.toLowerCase();
  if (!combined.trim()) return "generic_business";

  let bestMatch: SubNicheCategory = "generic_business";
  let maxScore = 0;

  for (const [key, profile] of Object.entries(NICHE_RESEARCH_PROFILES)) {
    let score = 0;
    for (const kw of profile.keywords) {
      if (combined.includes(kw)) {
        score += kw.length; // weight longer keyword matches higher
      }
    }
    if (score > maxScore) {
      maxScore = score;
      bestMatch = key as SubNicheCategory;
    }
  }

  return bestMatch;
}

export function getNicheResearchProfile(subNiche: SubNicheCategory): NicheResearchDrivers {
  return NICHE_RESEARCH_PROFILES[subNiche] ?? NICHE_RESEARCH_PROFILES.generic_business;
}

export const INDUSTRY_CATEGORIES: IndustryCategory[] = [
  "restaurant",
  "salon",
  "gym",
  "clinic",
  "retail",
  "real_estate",
  "local_service",
  "saas",
  "generic",
];

export function allIndustryCategories(): IndustryCategory[] {
  return [...INDUSTRY_CATEGORIES];
}

export function classifyIndustry(industryText?: string | null, descriptionText?: string | null): IndustryCategory {
  const sub = classifySubNiche(industryText, descriptionText);
  return NICHE_RESEARCH_PROFILES[sub]?.parentCategory ?? "generic";
}

const PRIMARY_NICHE_FOR_CATEGORY: Record<IndustryCategory, SubNicheCategory> = {
  restaurant: "restaurant_family",
  salon: "salon_hair_beauty",
  gym: "gym_commercial",
  clinic: "clinic_dental",
  retail: "retail_fashion_boutique",
  real_estate: "real_estate_residential",
  local_service: "service_plumbing_hvac",
  saas: "saas_platform",
  generic: "generic_business",
};

export function getIndustryProfile(category: IndustryCategory) {
  const sub = PRIMARY_NICHE_FOR_CATEGORY[category] ?? "generic_business";
  const match = NICHE_RESEARCH_PROFILES[sub] ?? NICHE_RESEARCH_PROFILES.generic_business;
  return {
    category,
    concepts: match.sampleHooks,
    relevanceVocabulary: match.relevanceVocabulary,
    visualStyle: match.visualDirection,
    ctaStyle: match.ctaPhrasings[0] || "an invitation to get in touch",
  };
}

/**
 * Target-industry-contamination detection (STRATXCEL ONE-SHOT REBUILD
 * mission, Section 16): found live in production -- 2 of StratXcel's own 4
 * real published posts read as though StratXcel ITSELF were a clinic
 * ("...while you focus on your patients. Dr. Sharma sits at the wooden
 * reception desk of a local clinic..."), because the model illustrated a
 * customer example by addressing the READER in second person with an
 * industry-specific possessive noun, instead of a clearly third-person,
 * explicitly-attributed example ("a growing retail business... they
 * implemented..." -- the correct pattern, also found live on a different
 * real published post). `classifyIndustry` itself was NOT the bug here --
 * StratXcel's own brand profile correctly classifies as "generic" (a B2B
 * SaaS company, not a locally-served vertical) -- this catches the specific
 * failure mode of the generated COPY nonetheless drifting into a different
 * industry's identity.
 *
 * Deliberately a small, hand-picked, high-precision word list rather than
 * each industry's full relevanceVocabulary: many of those words (e.g.
 * "service", "client", "solution", "problem") are completely ordinary,
 * legitimate B2B language and would false-positive constantly if used here.
 * Same conservative philosophy as classifyIndustry's own header comment:
 * never guess wrong (a false positive here blocks genuinely fine copy).
 * `local_service`'s own vocabulary overlaps too much with ordinary business
 * language to include at all -- deliberately omitted.
 */
// Real gap found live (StratXcel platform-closure session): this list
// only ever covered SECONDARY identity-claiming nouns (e.g. "your
// patients") -- it never included the category's own PRIMARY noun (e.g.
// "your clinic"), even though that is the most direct, obvious form of
// the exact contamination pattern this check exists to catch. Confirmed
// live: a real generated on-image headline ("...while you run your
// clinic.") was NOT flagged by the pre-fix version of this list, because
// "clinic" itself was never in it -- only "patients"/"patient" were.
const IDENTITY_CLAIMING_NOUNS: Partial<Record<IndustryCategory, string[]>> = {
  clinic: ["clinic", "clinics", "patients", "patient"],
  restaurant: ["restaurant", "restaurants", "diners", "menu"],
  salon: ["salon", "salons", "stylists"],
  gym: ["gym", "gyms", "workout", "gym members"],
  retail: ["store", "stores", "shop", "shops", "shoppers", "storefront"],
  real_estate: ["property", "properties", "tenants", "listings"],
  // local_service deliberately left unmapped: it's a broad catch-all
  // category (not a specific business type like "clinic"/"salon"), and
  // its most obvious identity-claiming candidates ("customers",
  // "clients") are near-universal B2B/B2C phrasing every industry
  // legitimately uses -- adding them would false-positive constantly
  // rather than catch a real, specific contamination pattern.
};

export interface IndustryContaminationCheck {
  isContaminated: boolean;
  reason: string | null;
}

/** `ownIndustry` is the business's OWN classified category (from
 * classifyIndustry against ITS OWN identity/description) -- that
 * category's own words are correctly self-referential and are never
 * flagged. Every other category's identity-claiming words are checked. */
export function checkTargetIndustryContamination(caption: string, ownIndustry: IndustryCategory): IndustryContaminationCheck {
  const lower = caption.toLowerCase();
  for (const [category, nouns] of Object.entries(IDENTITY_CLAIMING_NOUNS) as Array<[IndustryCategory, string[]]>) {
    if (category === ownIndustry) continue;
    for (const noun of nouns) {
      const pattern = new RegExp(`\\byour\\s+${noun}\\b`, "i");
      if (pattern.test(lower)) {
        return {
          isContaminated: true,
          reason: `"your ${noun}" addresses the reader as though the business itself were a ${category.replace("_", " ")} -- a customer example must be third-person and clearly attributed (e.g. "a local ${category.replace("_", " ")}... they use...", never "you"/"your ${noun}")`,
        };
      }
    }
  }
  return { isContaminated: false, reason: null };
}
