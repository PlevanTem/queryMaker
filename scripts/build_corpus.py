"""Build the full corpus HTML from existing data + additional topics."""
import sys, re, json, os
sys.stdout.reconfigure(encoding='utf-8')

# ── Load existing topics ─────────────────────────────────────
with open('data/output/corpus_plan_full.html', encoding='utf-8') as f:
    existing = f.read()

pattern = re.compile(r'l2:"([^"]+)",\s*l2full:"([^"]+)",\s*topics:\[(.*?)\]', re.DOTALL)
base = {}
for m in pattern.finditer(existing):
    l2, l2full, topics_block = m.group(1), m.group(2), m.group(3)
    topics = re.findall(r'"([^"]+)"', topics_block)
    base[l2] = {'l2full': l2full, 'topics': topics}

# ── Additional topics per L2 ─────────────────────────────────
extra = {
"① 个人生活类": [
  "Family Heritage Genealogy Photo Book","Night Sky Astrophotography Log",
  "Expat Life Abroad City Chronicle","Seasonal Garden Planting Journal",
  "New City Exploration Diary","College Campus Memory Capsule",
  "Youth Sports Team Season Chronicle","First Home Renovation Showcase",
  "Music Festival Memories Album","Martial Arts Progress Showcase",
  "Sea and Dive Adventure Log","Solo Backpacking Asia Diary",
  "Dog Adoption and Training Journey","Post-Breakup Recovery Healing Diary","Neighborhood Street Art Photography Log"
],
"② 个人专业类": [
  "Data Scientist Research Portfolio","Urban Planner Project Showcase",
  "Tattoo Artist Design Gallery","Voice Actor Demo Reel Page",
  "Makeup Artist Before After Showcase","Physical Therapist Client Results",
  "Digital Marketing Manager Case Studies","Fine Art Curator Gallery",
  "Theater Director Production Portfolio","Dog Trainer Results Showcase",
  "Real Estate Agent Sales Portfolio","Biomedical Researcher Publication Page",
  "Ceramics Artist Workshop Showcase","Financial Planner Success Stories","Forensic Science Analyst Profile"
],
"③ 办公/商务类": [
  "Legal Firm Case Study Showcase","Healthcare Clinic Services Brochure",
  "E-learning Course Catalog Overview","Food and Beverage Brand Story",
  "Luxury Brand Heritage Showcase","Co-working Space Member Guide",
  "Fashion Brand Seasonal Lookbook","University Admissions Information Page",
  "Sports Agency Management Profile","Pharmaceutical R&D Pipeline Overview",
  "Construction Project Portfolio","Airline Fleet Route Introduction",
  "Energy Company ESG Report","Agriculture Tech Company Profile","Defense Capabilities Overview Deck"
],
"④ 文化/知识类": [
  "Cryptocurrency Origins History Timeline","Cold War Analysis Timeline",
  "Renaissance Art and Artists Guide","Language Evolution and Etymology",
  "Olympic Games History Chronicle","Women Suffrage Movement Story",
  "Quantum Computing Explainer","Indigenous Peoples Rights Story",
  "Architecture Styles Evolution Timeline","Mythology and Legends Compendium",
  "Modern Medicine Discovery Timeline","Environmental Movement History",
  "Jazz and Blues Music Origins","Photography History Chronicle","Maritime Exploration Age Guide"
],
"① Adding & Creating": [
  "Forum discussion thread starter with category tagging","Community event with ticketing and capacity limit",
  "Language deck creation with spaced-repetition schedule","Investment watchlist ticker add with price alert",
  "HR leave request with document and coverage attach","Insurance claim with photo evidence upload",
  "Property inspection checklist with severity scoring","Grant application new submission with file attach",
  "Podcast episode wizard with chapter marks","IoT automation trigger-action rule creation",
  "Classroom live poll with countdown timer","Volunteer shift signup with skill matching",
  "Emergency contact add with relationship and access","Time-off request with coverage plan and approval","Shared expense split with receipt photo"
],
"② Editing & Updating": [
  "Multi-step checkout delivery address and payment edit","Blog post SEO metadata and slug update",
  "Shared document collaborative edit with conflict resolve","Inventory SKU attributes bulk update form",
  "Employee performance review update with comment thread","Vehicle maintenance record update with mileage",
  "Lease renewal contract terms negotiation edit","Sprint backlog story point estimate update",
  "Scheduled social post edit before publish","Prescription refill request edit and resubmit",
  "Custom dashboard widget resize and reposition","Recurring billing cycle date change confirm",
  "Club member tier status upgrade form","Dietary plan weekly meal swap and nutrition check","Student grade dispute form edit and resubmit"
],
"③ Searching & Finding": [
  "In-app OCR text recognition image search","Nested folder deep search with breadcrumb path",
  "Code symbol and function IDE-style search","Social platform username and profile search",
  "Transaction merchant category and amount search","Knowledge graph concept relationship explorer",
  "Podcast transcript full-text keyword search","Property deed and public record search",
  "Alumni network reunion by year and major","Scientific formula notation search and verify",
  "Playlist mood and tempo discovery search","Forum expertise and skills contributor search",
  "Marketplace seller reputation and location search","Medication drug interaction lookup","Shipping tracking number multi-carrier search"
],
"④ Selecting & Choosing": [
  "Preferred notification channel multi-select","Insurance deductible and tier selection",
  "Dashboard card metric arrangement drag select","Report visualization type chooser",
  "Background music mood selection for video","Accessibility text size and contrast chooser",
  "Academic course selection with credit count","Investment risk appetite profile selector",
  "Home delivery frequency preference selector","Workspace collaboration tool plan selection",
  "Parental control content level selector","Smart home scene activation chooser",
  "Tournament bracket team pairing selector","Restaurant dietary preference filter select","Team sprint velocity target slider"
],
"⑤ Filtering & Sorting": [
  "Customer segment filter by lifetime value","Research library filter by impact factor",
  "Medical symptom filter by severity and onset","Compliance document filter by jurisdiction",
  "Marketplace listing filter by seller rating","Portfolio asset class and region filter",
  "Leaderboard rank filter by region and age","Support queue filter by SLA urgency",
  "Employee directory filter by department level","Learning path filter by skill and duration",
  "Appointment slot filter by provider availability","Venue filter by capacity and AV equipment",
  "IoT sensor reading anomaly threshold filter","Menu item allergy and dietary filter","Analytics cohort demographic segment filter"
],
"⑥ Deleting & Removing": [
  "Scheduled post cancel and move to draft","Friend request decline with block option",
  "Subscription pause with refund grace period","Selective app data reset with category picker",
  "Co-author write permission revoke from document","Alert rule deactivate with archive keep",
  "Referral code expire and batch deactivate","Linked bank account unlink with balance confirm",
  "Location history selective entry delete","App permission selective revoke by category",
  "Automated task disable and keep logs","Shared folder unshare with member notification",
  "Loyalty reward redemption reversal request","Custom webhook endpoint delete with log","Fleet vehicle decommission record archive"
],
"⑦ Editing Profile": [
  "Nonprofit volunteer cause and skills profile","Legal professional bar registration profile",
  "Telemedicine patient health baseline history","Religious community member role profile",
  "Personal finance budget persona profile","Expat community home city and language profile",
  "Online marketplace buyer trust score profile","Performing arts ensemble role and audition",
  "Scientific researcher ORCID publication profile","E-sports competitive rank and stats profile",
  "Farm and agriculture producer certificate profile","Local government official representative profile",
  "Language exchange native tongue and goal profile","Peer-to-peer rental host listing profile","Meditation practitioner streak and level profile"
],
"⑧ Uploading & Downloading": [
  "Legal contract digital signature upload flow","Survey image-response photo capture upload",
  "Academic thesis multi-file submission upload","Field inspection GPS-geotagged photo upload",
  "Smart meter data export CSV download","Manufacturing QA inspection report export",
  "Immigration visa document upload checklist","Social media scheduled batch media upload",
  "Encrypted backup archive secure download","Custom data pipeline result export and share",
  "Telemedicine diagnostic scan DICOM upload","Fleet vehicle inspection photo tag upload",
  "AI training dataset batch upload and validate","Digital artwork mint-ready file upload","Annual membership certificate PDF download"
],
"⑨ Copying & Duplicating": [
  "Tax filing prior-year data copy and prefill","Sprint retrospective template board clone",
  "Customer journey map stage duplicate","Loyalty tier benefit structure copy and adjust",
  "Production environment config copy to staging","Product bundle copy with new pricing",
  "Invoice line item copy to new invoice","Shift rotation weekly pattern duplicate",
  "Classroom rubric grading template copy","Chatbot conversation dialog flow clone",
  "Subscription renewal auto-copy with updated terms","Smart home scene duplicate for new room",
  "Content calendar weekly template copy and shift","Campaign A/B test variant copy and modify","Emergency response protocol duplicate for drill"
],
"⑩ Misc": [
  "Face ID and fingerprint biometric enrollment","Home screen widget add and resize",
  "Accessibility feature onboarding wizard","App permissions audit and revoke manager",
  "Bluetooth device pairing and name assignment","Calendar external account sync setup",
  "Cross-platform data import and mapping flow","Deep link disambiguation destination chooser",
  "In-app live chat support widget launch","Post-session rating and feedback prompt",
  "Referral milestone reward unlock animation","Sponsored result label transparency info",
  "Shared screen annotation drawing toolbar","Social share sheet preview with deep link","Wallet pass add to mobile device flow"
],
"① 计算器/换算器": [
  "Ohm Law Electrical Resistance Calculator","Molecular Weight Chemistry Calculator",
  "Real Estate Cap Rate Investment Calculator","Payroll Gross-to-Net Salary Calculator",
  "Foreign Currency Real-Time Rate Converter","Body Frame Size BMI Variant Calculator",
  "Fuel Efficiency MPG to Liter Converter","Lumber Volume Board Feet Calculator",
  "Road Trip Fuel Cost Estimator","Cooking Measurement US to Metric Converter",
  "Retirement Withdrawal Safe Rate Calculator","Time Zone Meeting Scheduler Tool",
  "Photo Print DPI Resolution Calculator","Knitting Yarn Yardage Estimator","Musical BPM and Time Signature Helper"
],
"② 生活记录器": [
  "Daily Mood and Energy Level Journal","Gratitude Three-Things Daily Log",
  "Coffee and Caffeine Intake Tracker","Book Reading Pages Progress Tracker",
  "Screen Time App Category Logger","Personal Finance Cash Flow Daily Log",
  "Symptom and Medication Side Effect Journal","Baby Feeding and Diaper Change Log",
  "Social Interaction Quality Diary","Weather and Outfit Daily Match Log",
  "Focus Session Deep Work Log","Language New Words Learned Daily",
  "Home Chore Completion Habit Log","Sleep Quality Subjective Rating Log","Daily Step and Active Minutes Recorder"
],
"③ 社交辅助": [
  "Icebreaker Question Generator for Events","Social Anxiety Conversation Prompt Card",
  "LinkedIn Connection Message Personalizer","Thank-You Note Template Generator",
  "Apology Message Builder and Tone Checker","Gift Recommendation by Personality Type",
  "Party Guest Introduction Card Generator","Long-Distance Friendship Activity Planner",
  "Social Media Caption and Emoji Generator","Difficult Conversation Script Builder",
  "Networking Event Pre-Meeting Prep Kit","Holiday Card Message Creator",
  "Team Building Activity Idea Suggester","Compliment and Encouragement Generator","Birthday and Anniversary Smart Reminder"
],
"④ 倒计时/纪念日": [
  "Baby Due Date Countdown Widget","Final Exam Study D-Day Countdown",
  "Event Ticket Show Countdown Timer","Retirement Age Years-Left Counter",
  "Sports Season Opening Countdown","Bar or Board Exam Prep Countdown",
  "Visa Immigration Status Deadline Tracker","Sobriety Clean Days Milestone Counter",
  "Military Deployment Return Countdown","Apartment Lease Renewal Date Tracker",
  "Product Launch Date Countdown Page","Album or Book Release Countdown",
  "Space Mission Launch Event Countdown","Festival and Holiday Season Countdown","Relationship Monthly Anniversary Tracker"
],
"⑤ 文本处理": [
  "Text Case Converter UPPER lower Title","Word and Character Count with Density",
  "Duplicate Line and Phrase Remover","Text Diff Side-by-Side Comparison",
  "Email Subject Line A/B Tester","JSON CSV YAML Formatter and Validator",
  "Regular Expression Builder and Tester","Spell Check and Grammar Corrector",
  "Text Summarizer Key Points Extractor","Secure Password Strength Generator",
  "Markdown to HTML Converter","Readability Flesch Score Checker",
  "Morse Code Encoder and Decoder","Text Encryption AES Tool","Lorem Ipsum Placeholder Generator"
],
"⑥ 随机生成器": [
  "Dinner Menu Random Spin Wheel","Workout Exercise Random Picker",
  "Movie Genre and Film Random Selector","Baby Name Random Generator",
  "Random Color Palette Brand Creator","Story Prompt and Writing Idea Generator",
  "Random Team Tournament Bracket Builder","Trivia Question Category Picker",
  "Vacation Destination Roulette Wheel","Random Acts of Kindness Daily Suggester",
  "Board Game Scenario and Event Generator","Dice Roll and Coin Flip Simulator",
  "Ice Cream Flavor Combo Picker","Career Path Random Explorer","Motivational Quote Daily Generator"
],
"⑦ 无障碍辅助": [
  "Real-Time Screen Reader Voice Narration","Image Alt Text Auto-Describer AI",
  "Live Caption Generator for Audio and Video","One-Hand Swipe Operation Mode Toggle",
  "High Contrast and Colorblind Palette Mode","Large Text and Dyslexia Friendly Font",
  "Voice-to-Command Navigation Map","Eye-Gaze Cursor Navigation Mode",
  "Tremor Filter Touch Stabilizer Setting","Sign Language Webcam Interpreter",
  "Simplified Vocabulary Reading Mode","Predictive AAC Symbol Communication Board",
  "Hearing Aid Bluetooth Connection Guide","Magnifier Loop with Freeze Frame Capture","Cognitive Load Reducer Minimal Interface"
],
"⑧ 其他长尾微工具": [
  "Parking Location Quick Pin Saver","Pill and Capsule Photo Identifier",
  "Dream Journal and Symbol Glossary","Geocache Location Field Logger",
  "Plant Disease Photo Diagnoser","Home Wi-Fi Speed Tester Tool",
  "Ambient Noise dB Level Meter","Star Gazing Constellation Finder",
  "QR Code Business Card Generator","USB Cable and Port Type Identifier",
  "Car VIN Decoder and History Lookup","Local Sunrise and Sunset Clock",
  "Shadow Length and Sun Angle Calculator","Battery Charge Cycle Optimizer","Vintage Item Age Estimate Tool"
],
"① 闪卡/单词记忆": [
  "Language Verb Conjugation Flashcards","Medical Terminology Spaced Repetition Deck",
  "Legal Case Principle Memorization Cards","Chemistry Periodic Element Symbol Cards",
  "History Date and Event Matching Cards","GRE Vocabulary Retention Drill Deck",
  "World Capital and Country Flag Cards","Sign Language Gesture Visual Card Set",
  "Music Theory Note and Chord Cards","Programming Syntax and API Flashcard Deck",
  "Math Formula and Theorem Reference Cards","Art History Period and Style Cards",
  "Anatomy Body Part Label Cards","Currency and Country Association Cards","Financial Term Definition Drill Cards"
],
"② 备考自测/刷题": [
  "SAT and ACT Full Practice Simulation","IELTS TOEFL Writing Task Drill",
  "Medical License USMLE Question Bank","State Bar Exam Law Practice Set",
  "CFA Level 1 Financial Exam Drill","Data Science Interview Coding Question",
  "Driving Theory Test Simulation","Civil Service Exam Section Practice",
  "Real Estate License State Question Bank","Nursing NCLEX Practice Question Set",
  "PMP Project Management Exam Prep","CompTIA Security Plus IT Cert Drill",
  "GMAT Quant Reasoning Practice","AP Chemistry Lab Scenario Questions","Architecture ARE Vignette Exam Drill"
],
"③ 学习打卡/进度追踪": [
  "Language CEFR Level Progress Dashboard","Coding Bootcamp Daily Milestone Tracker",
  "Reading 52-Book Annual Challenge Log","Fitness Instructor Certification Progress",
  "Online Course Module Completion Rate","Guitar Practice Session Daily Logger",
  "Chess Rating Improvement Trend Chart","Drawing Skill Daily Prompt Log",
  "30-Day Habit Formation Streak Tracker","Creative Writing Daily Word Count Goal",
  "Research Paper Literature Review Log","Photography Monthly Challenge Tracker",
  "Cooking Technique Mastery Progress","Calligraphy Daily Practice Sheet Log","Mindfulness Meditation Weekly Streak"
],
"④ 课程目录/课堂界面": [
  "Online University Course Catalog Browser","K-12 Subject Curriculum Map View",
  "Coding Bootcamp Module Track Guide","Professional Certification Learning Path",
  "Language School Level Ladder Overview","Music Academy Lesson Weekly Schedule",
  "Fitness Class Studio Timetable","Corporate Training Catalog Browser",
  "Vocational Trade Skills Directory","STEM Enrichment Module Explorer",
  "Cooking School Class Schedule","Art Workshop and Studio Timetable",
  "Yoga and Wellness Class Browser","Online MBA Program Overview Map","Continuing Education Credit Tracker"
],
"⑤ 知识速查/公式表": [
  "Physics Constants and Formula Quick Sheet","Chemical Periodic Element Reference",
  "Grammar and Punctuation Rules Guide","Cooking Temperature and Time Reference",
  "Medical Drug Interaction Reference Table","Tax Bracket and Rate Calculator Sheet",
  "Musical Key Signature Chart Reference","Legal Latin Terms and Phrases Index",
  "Sports Rules and Penalty Reference Card","Stock Market Technical Indicator Cheat Sheet",
  "Photography Exposure Triangle Guide","Nutrition Macro and Calorie Reference",
  "Mortgage and Loan Payment Formula Sheet","Computer Keyboard Shortcuts Cheat Sheet","Building Code and Safety Standard Reference"
],
"① 待办清单/任务管理": [
  "Daily Priority Triage Task Board","Team Sprint Kanban Board",
  "Personal OKR Goal Breakdown Tracker","Household Chore Assignment Manager",
  "Client Deliverable Milestone Checklist","Weekly Review and Planning Template",
  "GTD Inbox Capture and Process Flow","Legal Case Action Steps Manager",
  "Research Paper Draft Stage Checklist","Event Coordinator Task Timeline",
  "Medical Protocol Step Checklist","Content Calendar Editorial Task List",
  "IT Service Desk Task Queue","Freelance Project Milestone Board","Job Search Application Status Tracker"
],
"② 番茄钟/专注计时": [
  "25/5 Pomodoro Focus Session Timer","Deep Work 90-Minute Flow State Timer",
  "Study Subject Rotation Clock","Pair Programming Rotation Switch Timer",
  "Remote Team Meeting Time Keeper","Language 10-Minute Drill Sprint Timer",
  "Mindful Work Break Scheduler","Classroom Activity Time Controller",
  "Mock Interview Practice Timer","Toastmasters Speech Minute Timer",
  "Cooking Multi-Stage Countdown","Manufacturing Quality Control Station Timer",
  "Daily Habit Time Block Manager","Gym Circuit Training Station Timer","Side Project Daily Tracking Timer"
],
"③ 日程/倒计时": [
  "Personal Weekly Schedule Planner","Conference and Event Day Schedule",
  "Academic Semester Calendar View","Sprint and Release Cycle Timeline",
  "Healthcare Appointment Date Book","Multi-Timezone World Clock Viewer",
  "Legal Court Date Deadline Tracker","Content Publishing Calendar",
  "Wedding Vendor Appointment Book","Property Inspection Schedule",
  "Medication Timing and Refill Schedule","Remote Team Shared Calendar View",
  "Project Phase Milestone Timeline","Recruiting Interview Schedule","Visa and Immigration Deadline Tracker"
],
"④ 数据仪表盘/报表": [
  "Sales KPI Performance Dashboard","Marketing Campaign ROI Analytics",
  "Personal Finance Spending Breakdown","Team Velocity and Burndown Chart",
  "Social Media Engagement Metrics Board","E-commerce Revenue Funnel View",
  "HR Headcount and Attrition Dashboard","Customer Support SLA Tracker",
  "Logistics Delivery Status Board","Energy Consumption Usage Monitor",
  "School Class Grade Performance Report","Health Vitals Personal Dashboard",
  "Crypto Portfolio Performance Chart","Research Citation Impact Dashboard","App Usage Analytics Overview"
],
"⑤ 笔记/文档编辑": [
  "Daily Work Log Meeting Note","Technical Documentation Writing Tool",
  "Meeting Minutes and Action Items","Research Literature Review Note",
  "Personal Knowledge Wiki Builder","Recipe Collection Digital Notebook",
  "Field Inspection Report Editor","Legal Case Summary Note Organizer",
  "Student Study Notes Flashcard","Code Comment Documentation Helper",
  "Creative Writing Draft Notebook","Project Brief Document Template",
  "Interview Transcript Note Taker","Client Call Summary Action Note","Personal Diary and Reflection Journal"
],
"① 饮水/服药/习惯提醒": [
  "Daily Water Intake 8-Glass Tracker","Prescription Pill Reminder and Refill Log",
  "Vitamin and Supplement Daily Reminder","Post-Surgery Recovery Protocol Reminder",
  "Mental Health Self-Care Routine Check","Daily Skincare Step Routine Reminder",
  "Diabetic Insulin Injection Schedule","Stretching Break Desk Alert",
  "Sun Protection Reapplication Timer","Allergy Season Antihistamine Tracker",
  "Pregnancy Nutrition Supplement Log","Eye Drop Interval Schedule Reminder",
  "Intermittent Fasting Window Alert","Posture Check Hourly Reminder","Bedtime Wind-Down Ritual Reminder"
],
"② 运动记录/健身计划": [
  "Strength Training Rep and Set Logger","Marathon Weekly Training Plan Tracker",
  "CrossFit WOD Score and Record","Cycling Route Distance and Speed Tracker",
  "Swimming Pool Lap Counter App","Yoga Flow Session Sequence Logger",
  "Rock Climbing Route Grade Tracker","Dance Choreography Practice Log",
  "Rowing Machine Split Time Tracker","Physical Therapy Home Exercise Log",
  "Team Sports Match Performance Record","Triathlon Swim Bike Run Planner",
  "Jump Rope Challenge Daily Counter","Golf Score and Handicap Tracker","Pilates Body Measurement Progress Log"
],
"③ 体重/经期/睡眠追踪": [
  "Morning Weigh-In Trend Chart","Menstrual Cycle and Fertile Window Calendar",
  "Sleep Quality and Stage Analysis","Body Measurement Tape Record Log",
  "Intermittent Fasting Protocol Tracker","Blood Glucose Level Daily Log",
  "Blood Pressure and Heart Rate Monitor","Body Fat Percentage Progress Tracker",
  "Hormone Cycle Symptom Diary","REM Sleep Disruption Pattern Analyzer",
  "Shift Worker Sleep Schedule Optimizer","Night Sweat and Hot Flash Log",
  "Child Growth Height and Weight Chart","Pregnancy Weight Gain Tracker","Bone Density Calcium Intake Log"
],
"④ 健康数据看板": [
  "Comprehensive Vitals Overview Dashboard","Mental Health Weekly Score View",
  "Nutrition Macro Balance Summary","Fertility Cycle Status Overview",
  "Athletic Performance Trend Dashboard","Chronic Condition Management Board",
  "Post-COVID Recovery Progress Tracker","Elder Care Daily Health Summary",
  "Pediatric Child Wellness Overview","Gut Health Digestive Score View",
  "Cardiovascular Risk Score Dashboard","Posture and Ergonomics Assessment",
  "Allergic Reaction Trigger Log Summary","Pre-Op Health Baseline Report","Immune System Wellness Score"
],
"⑤ 冥想/呼吸练习": [
  "4-7-8 Breathing Anxiety Relief Timer","Box Breathing Stress Reset Guide",
  "Loving-Kindness Meditation Script","Sleep Meditation Narration Series",
  "Pre-Exam Focus Breathing Calm","Grief Processing Gentle Meditation",
  "Nature Soundscape Ambient Session","Anger Release Breathwork Guide",
  "Morning Energy Activation Pranayama","Chronic Pain Body Scan Session",
  "PTSD Grounding Technique Guide","Progressive Muscle Relaxation Session",
  "Inner Child Healing Visualization","Athletic Mental Performance Rehearsal","Pregnancy Birth Preparation Breathing"
],
"① 行程规划器": [
  "City Hop Multi-Destination Planner","Budget Backpacker Route Builder",
  "Family Road Trip Day-by-Day Planner","Luxury Hotel and Spa Itinerary",
  "Adventure Hiking Circuit Planner","Cultural Heritage Site Tour Guide",
  "Food and Restaurant Crawl Planner","Business Trip Optimized Schedule",
  "Festival and Event Circuit Planner","Honeymoon Romantic Getaway Builder",
  "Solo Female Travel Safe Route","Group Graduation Trip Planner",
  "Study Abroad City Explorer Plan","Senior Accessible Travel Planner","Digital Nomad Work-Travel Schedule"
],
"② 打包清单/旅行准备": [
  "Beach Vacation Packing Checklist","Winter Ski Trip Gear List",
  "Business Trip Essentials Checklist","Ultralight Backpacking Gear List",
  "Baby and Family Supply Trip List","Camping Outdoor Equipment Checklist",
  "Medical and Prescription Travel Kit","Adventure Sports Equipment List",
  "Cruise Ship Packing Guide","Safari and Wildlife Photography Kit",
  "Yoga Retreat Wellness Pack List","Music Festival Camping Gear List",
  "International Move Shipping Checklist","Wedding Destination Couple Pack List","Remote Work Digital Nomad Kit"
],
"③ 地图/路线导航": [
  "Walking Tour Self-Guided City Map","Cycling Path and Trail Navigator",
  "Scenic Road Trip Route Planner","Public Transit Multi-Modal Route",
  "Off-Road 4WD Track Navigator","Mountain Hiking Summit Trail Map",
  "Urban Wheelchair Accessible Route","Emergency Evacuation Route Map",
  "University Campus Building Finder","Shopping Mall Indoor Navigator",
  "Airport Terminal Gate Finder","Ski Resort Run and Lift Map",
  "Historical City Walking Guide","Night Market Neighborhood Map","Theme Park Attraction Route Planner"
],
"④ 天气/实时信息查询": [
  "7-Day Hyperlocal Forecast Widget","Storm Alert and Lightning Tracker",
  "Air Quality AQI Live Monitor","UV Index Sun Exposure Warning",
  "Pollen Count Allergy Forecast","Surf and Wave Height Condition",
  "Wind Speed Paragliding Safety Check","Ski Resort Snow Depth Alert",
  "Agricultural Frost Warning System","Offshore Marine Weather Forecast",
  "Festival Rain Probability Checker","Golden Hour Photography Timer",
  "Hurricane and Typhoon Track Map","Flood River Level Warning","Wildfire Smoke Air Quality Alert"
],
"⑤ 交通时刻/票价查询": [
  "High-Speed Train Timetable Lookup","Budget Airline Fare Comparison",
  "Ferry and Boat Schedule Finder","Bus Station Live Departure Board",
  "Subway and Metro Route Map","Ride-Share Price Estimate Comparison",
  "Intercity Coach Ticket Booking","School Shuttle Bus Live Tracker",
  "Airport Shuttle Fare Calculator","Bicycle and Scooter Rental Locator",
  "Highway Toll Road Cost Estimator","Car Park Availability and Pricing",
  "Cross-Border Transport Schedule","Night Bus and Last Train Alert","Cargo Freight Rate Calculator"
],
"① 今天吃什么随机选择器": [
  "Office Lunch Nearby Restaurant Wheel","Vegetarian Meal Option Random Picker",
  "Weekend Brunch Style Idea Suggester","Comfort Food Mood-Based Selector",
  "Low-Calorie Healthy Option Picker","Global Cuisine Culture Roulette",
  "Group Consensus Dinner Vote Wheel","Budget Meal Under Dollar Ten Picker",
  "Late Night Delivery Option Randomizer","Seasonal Ingredient Dish Suggester",
  "Leftover Ingredients Recipe Idea Wheel","Party Snack and Finger Food Selector",
  "Kids Picky Eater Meal Suggestion","Fusion Food Style Randomizer","World Street Food Random Picker"
],
"② 食物热量/升糖查询": [
  "Per-Serving Calorie Count Lookup","Glycemic Index and Load Database",
  "Macro Nutrient Breakdown Label","Restaurant Dish Nutrition Info Lookup",
  "Alcoholic Drink Calorie Comparison","Baby and Infant Food Nutrition Guide",
  "Sports Nutrition Protein Calculator","Anti-Inflammatory Food Score Index",
  "Heart-Healthy Fat Content Guide","Diabetic-Friendly Meal Score Lookup",
  "Vegan Protein Source Reference","Bone Health Calcium Food Finder",
  "Gut Health Fiber and Probiotic Score","Prenatal Food Safety Guide","Cholesterol and Sodium Intake Guide"
],
"③ 菜谱生成/食材搭配": [
  "30-Minute Weeknight Dinner Generator","Plant-Based Protein Meal Builder",
  "Leftover Ingredient Creative Recipe","Traditional Regional Cuisine Guide",
  "Keto and Paleo Diet Recipe Generator","Baking Science Ratio and Substitution",
  "Cocktail and Mocktail Mixer Builder","Global Spice Pairing Flavor Profile",
  "Fermentation and Pickling Step Guide","Kids Balanced Nutrition Meal Planner",
  "Party Catering Quantity Scaler","Seasonal Harvest Recipe Matcher",
  "Sous Vide Time and Temperature Table","Allergen-Free Substitution Helper","World Street Food Home Recreation Guide"
],
"④ 餐厅列表/点评浏览": [
  "Michelin Star Restaurant City Guide","Hidden Gem Local Eatery Discovery Map",
  "Vegan and Plant-Based Dining Finder","Late Night Open Now Restaurant Finder",
  "Romantic Date Restaurant Picker","Pet-Friendly Outdoor Dining Map",
  "All-You-Can-Eat Buffet Locator","Street Food Market Directory",
  "Food Truck Live Location Tracker","Family Brunch Weekend Spot Reviews",
  "Business Lunch Power Venue List","Rooftop Bar and Dining Guide",
  "Cultural Cuisine Festival Vendor Guide","Budget Student Eatery Directory","Gluten-Free and Celiac-Safe Venue List"
],
"① 文字猜谜/知识竞赛": [
  "Daily Wordle-Style Word Puzzle Game","Trivia Night Multiplayer Quiz Battle",
  "Science and Nature Fact Challenge","Movie Quotes Who Said It Game",
  "World Capitals Geography Quiz","Music Lyric Fill-in-the-Blank",
  "Brand Logo Visual Recognition Quiz","Historical Year Estimation Game",
  "Celebrity Lookalike Guess Challenge","Anagram Word Unscrambler Puzzle",
  "Sports Stats Trivia Duel","Math Mental Arithmetic Speed Challenge",
  "Literary Character Identifier Quiz","Country Silhouette Guess Map Game","Emoji Meaning Decode Word Game"
],
"② 抽签/转盘/随机决策": [
  "Restaurant Dinner Spin Decision Wheel","Team Chore Random Assignment Draw",
  "Movie Night Genre Vote and Spin","Secret Santa Gift Exchange Assign",
  "Party Truth or Dare Selector","Classroom Cold-Call Random Student Pick",
  "Travel Weekend Destination Spin","Career Path Random Exploration Wheel",
  "Dating Icebreaker Question Picker","Fantasy Sports Draft Lottery Draw",
  "Giveaway Prize Random Winner Draw","Meeting Facilitator Turn Selector",
  "Workout Challenge Day Random Picker","Book Club Next Read Selector Wheel","Holiday Activity Spin Planner"
],
"③ 经典小游戏": [
  "2048 Number Merge Tile Puzzle","Snake Classic Arcade Retro Game",
  "Minesweeper Logic Deduction Puzzle","Sudoku Daily Number Challenge",
  "Mahjong Tile Match Puzzle Game","Tetris Block Stacking Classic",
  "Memory Card Flip Match Game","Hangman Vocabulary Word Game",
  "Chess Beginner Puzzle Challenge","Daily Crossword Word Grid",
  "Klondike Solitaire Card Game","Bubble Shooter Arcade Popper",
  "Tap Rhythm Beat Game","Connect Four Strategy Drop Game","Simon Says Color Sequence Memory"
],
"④ 情绪减压/解压玩具": [
  "Pop Bubble Wrap Satisfying Simulator","Sand Drawing Touch Canvas",
  "Water Surface Ripple Tap Relaxer","Virtual Slime Squeeze Toy",
  "Rubber Band Snap Stress Reliever","Kinetic Sand Digital Sculpt",
  "Anxiety Ball Squeeze Tap Toy","Rhythmic Drum Pad Beat Tapper",
  "Finger Fidget Spinner Physics","Paper Ripping ASMR Sound Effect",
  "Snow Globe Shake and Settle","Glitter Jar Meditation Focus Aid",
  "Zen Rock Stacking Balance Game","Magnetic Ferrofluid Touch Toy","Calming Color Flow Gradient Generator"
],
"① 图片编辑/滤镜/裁剪": [
  "Portrait Beauty Retouch Filter","AI Background Removal Tool",
  "Multi-Photo Collage Layout Builder","Vintage Film Grain Preset Effect",
  "HDR Landscape Tone Mapping Tool","Batch Image Resize and Export",
  "Watermark Add and Remove Tool","Color Grading LUT Preset Apply",
  "Blemish Spot Removal Retouching","EXIF Metadata Viewer and Editor",
  "Blur and Pixelate Object Tool","Black and White Style Conversion",
  "Tilt-Shift Miniature Effect","Clone Stamp and Healing Brush","Photo Meme Caption Text Overlay"
],
"② 海报/简历/卡片模板": [
  "Birthday Party Event Poster Design","Modern Job Resume Template Creator",
  "Wedding Invitation Card Designer","Business Name Card Maker",
  "Social Media Story Slide Template","Graduation Announcement Card Design",
  "Sale and Promo Flyer Creator","Professional Certificate Generator",
  "Book Cover Template Design Tool","Product Label Sticker Creator",
  "Christmas and Holiday Greeting Card","Travel Postcard Photo Maker",
  "Motivational Quote Poster Builder","Class Reunion Invitation Card","Concert and Gig Event Flyer Design"
],
"③ 音视频播放界面": [
  "Podcast Player with Chapter Navigation","Music Album Full-Screen Art Player",
  "Audiobook Chapter Bookmark Player","Karaoke Lyric Sync Highlight Player",
  "Live Stream Low-Latency Viewer","Video Essay Jump-to-Chapter UI",
  "ASMR Binaural Audio Player","Vertical Short-Form Video Feed",
  "DJ Mix Waveform Visualizer Player","Meditation Sound Ambient Timer",
  "Sports Replay Frame-by-Frame Viewer","Language Listening Drill Player",
  "Kids Animated Story Interactive Player","Ambient Noise Loop Mixer","Concert Archive Recording Player"
],
"④ 内容创作工具": [
  "YouTube Video Script Storyboard Builder","TikTok Caption and Hashtag Generator",
  "Newsletter HTML Email Drag Builder","Podcast Show Notes Generator",
  "Instagram Carousel Slide Designer","Blog Post Outline and SEO Optimizer",
  "Twitter Thread Composer Tool","Explainer Video Slide Deck Builder",
  "LinkedIn Thought-Leadership Post Helper","Product Screen Recording Tool",
  "Subtitle and Closed Caption Editor","Brand Voice and Tone Checker",
  "Press Release Template Creator","Digital Zine and Lookbook Publisher","Crowdfunding Campaign Page Builder"
],
"① 信息流/Feed浏览": [
  "AI-Curated Personalized Newsfeed","Breaking News Live Ticker Stream",
  "Local Community Events News Feed","Financial Markets News Live Stream",
  "Sports Scores and Highlights Feed","Science and Tech Discovery Feed",
  "Entertainment and Pop Culture Feed","Startup VC Funding News Feed",
  "Climate and Environment News Feed","Health and Medical Discovery Stream",
  "Political News Multi-Perspective View","Fashion and Style Trend Feed",
  "Gaming and Esports Live News Feed","Agriculture and Food Industry News","Education Policy and Reform Feed"
],
"② 文章详情/阅读模式": [
  "Long-Form Investigative Article Reader","Academic Paper PDF Inline Viewer",
  "Data Visualization Embedded Article","Inline Translation Reading Mode",
  "Audio Read-Aloud Article Mode","Offline Saved Article Reader",
  "Interactive Data Journalism Story","Paywall Article Preview Mode",
  "Annotation and Highlight Note Taker","Dark and Sepia Night Reading Mode",
  "Newsletter Single Issue Archive View","Magazine Spread Visual Format",
  "Fact-Check Citation Inline Overlay","Quote Clip and Share Extraction","Reading Progress Scroll Indicator"
],
"③ 订阅/频道管理": [
  "Topic Interest Subscription Setup","Newsletter Email Hub Manager",
  "RSS Channel Subscriber Feed","Podcast Series Subscription Library",
  "Author and Journalist Follow Feed","Premium Paywall Content Pass Manager",
  "Push Alert Frequency Preference","Community Forum Thread Subscribe",
  "Industry Report Digest Subscription","Sports Team News Alert Follow",
  "Brand Product Launch Alert Subscribe","Research Publication New Issue Alert",
  "Live Event Update Subscribe","Streaming Watchlist Channel Add","Local Government Notice Subscribe"
],
"④ 搜索与筛选": [
  "News Archive Date Range Search","Reporter and Author Content Search",
  "Topic Tag and Keyword News Filter","Fact-Checked Content Filter Toggle",
  "Opinion vs Report Category Filter","Source Credibility Tier Filter",
  "Multi-Language Global News Search","Trending Hashtag News Explorer",
  "Company and Stock Mention Search","Viral Story Engagement Filter",
  "Geo-Location Local News Filter","Saved Bookmarks Article Search",
  "Breaking vs Analysis Article Filter","Newsletter Issue Keyword Search","Subject and Beat Category Filter"
],
"① 商品详情/规格选择": [
  "Electronics Tech Spec Comparison Detail","Fashion Size Chart Product Detail",
  "Furniture Room AR Preview Page","Grocery Product Nutrition Label View",
  "Sports Equipment Size Guide Selector","Luxury Watch Complication Detail",
  "Subscription Box Contents Preview","Auto Parts Vehicle Compatibility Check",
  "Cosmetics Shade Match Finder","Custom Engraving Preview Tool",
  "Book Synopsis and Sample Reader","Instrument Technical Spec Sheet",
  "Home Appliance Feature Comparison","Sneaker Colorway 3D Viewer","Supplement Ingredient Label Detail"
],
"② 购物车/结算": [
  "Multi-Seller Marketplace Cart Review","Group Split Payment Order Cart",
  "Subscription Box Build and Review","Corporate Procurement Purchase Cart",
  "Grocery Delivery Slot Checkout","Digital Gift Card Checkout Flow",
  "Buy Now Pay Later Installment Cart","Crypto Wallet Checkout Flow",
  "Luxury Item White Glove Cart","Pet Subscription Box Basket",
  "Bulk Wholesale Order Summary","Donation and Fundraiser Checkout",
  "Pre-Order Reserve and Pay Flow","Flash Sale Limited Stock Cart","Trade-In Device Upgrade Cart"
],
"③ 订单/物流追踪": [
  "Real-Time GPS Parcel Tracking Map","Multi-Carrier Order Status Hub",
  "International Customs Clearance Status","Restaurant Food Delivery Live Map",
  "Cold Chain Temperature Log Tracker","Pre-Order Release Date Countdown",
  "Return and Refund Request Status","B2B Bulk Order Progress Monitor",
  "Fragile Item Handling Alert Notice","Crowdfunding Reward Delivery Tracker",
  "Prescription Home Delivery Status","Large Furniture Install Schedule",
  "Express vs Standard Shipment Compare","Missed Delivery Reschedule Flow","Invoice and Tax Receipt Download"
]
}

# ── Merge ────────────────────────────────────────────────────
merged = {}
for l2, data in base.items():
    add_topics = extra.get(l2, [])
    merged[l2] = {
        'l2full': data['l2full'],
        'topics': data['topics'] + add_topics
    }

# ── Stats ────────────────────────────────────────────────────
total = sum(len(v['topics']) for v in merged.values())
print(f"Total L2: {len(merged)}, Total topics: {total}")
counts = [len(v['topics']) for v in merged.values()]
print(f"Min: {min(counts)}, Max: {max(counts)}, Avg: {sum(counts)/len(counts):.1f}")

# ── Save merged data as JSON for HTML builder ─────────────────
with open('scripts/corpus_data.json', 'w', encoding='utf-8') as f:
    json.dump(merged, f, ensure_ascii=False, indent=2)
print("Saved corpus_data.json")
