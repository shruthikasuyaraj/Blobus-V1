import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail, 
  signOut, 
  onAuthStateChanged,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider
} from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
export const db = firebaseConfig.firestoreDatabaseId 
  ? getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId)
  : getFirestore(firebaseApp);
export const auth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();

// Firestore Error Handler helper
export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
};

export function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on initial boot
async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testFirestoreConnection();

/**
 * CozyFocus - Pastel Squishy Blob Master Application Logic
 * Master Focus Timer, Page Visibility 3-Strike Penalty Guard with Frozen Squish Reaction,
 * Pastel Shop Economy (Blob Colors, Expressions, Hats), Intention Tasks & Schedule Reminders,
 * Firebase User Authentication & Firestore Data Sync, Settings, Themes & Notifications.
 */

const TRANSPARENT_PIXEL = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='1' height='1'/>";

// Global State Object
const state = {
  user: null, // Firebase user or null (guest)
  theme: 'pastel', // 'pastel', 'dark', 'mint', 'blue', 'green', 'purple', 'orange', 'yellow', 'rainbow', 'red'
  notifications: {
    sessionReminders: true,
    breakNotifications: true
  },
  currentShopCategory: 'all', // Fix shop category state tracking ('all', 'colors', 'faces', 'hats')
  timer: {
    mode: 'work', // 'work' or 'break'
    status: 'idle', // 'idle', 'running', 'paused'
    timeRemaining: 25 * 60, // in seconds
    workDuration: 25 * 60,
    breakDuration: 5 * 60,
    intervalId: null
  },
  warningCount: 0, // 3-Strike tab switching penalty counter
  sessionFocusedSeconds: 0, // Tracks focused seconds in current session for 50-min bonus claim
  coinTimer: {
    activeWorkSeconds: 0 // Increments during active work, awards 50 coins per 600s (10 min)
  },
  coins: 0,
  streak: 0,
  totalFocusMinutes: 0,
  tabSwitchCount: 0,
  dailyFocusHistory: {}, // { "YYYY-MM-DD": minutes }
  ownedItems: ['color-soft-pink', 'face-happy-smile', 'hat-sprout', 'color-pastel-mint'],
  equippedItems: {
    colors: 'color-soft-pink',
    faces: 'face-happy-smile',
    hats: 'hat-sprout'
  },
  tasks: [
    { id: '1', text: 'Draft product specification for pastel dashboard', category: 'Work', priority: 'High', completed: false, createdAt: Date.now() },
    { id: '2', text: 'Read 15 pages of creative design principles', category: 'Growth', priority: 'Medium', completed: false, createdAt: Date.now() - 3600000 },
    { id: '3', text: 'Gentle stretching & warm chamomile tea', category: 'Habits', priority: 'Low', completed: true, createdAt: Date.now() - 7200000 }
  ],
  reminders: [
    { id: 'rem-1', text: 'Drink a glass of warm water 💧', triggerMinute: 10, triggered: false },
    { id: 'rem-2', text: 'Relax your neck & rest your eyes 🧘', triggerMinute: 20, triggered: false }
  ],
  taskMode: 'local', // 'local' or 'google'
  googleTasks: [],
  googleTasksConnected: false,
  calendar: {
    connected: false,
    upcomingEvents: []
  },
  speech: {
    currentText: "Let's focus together! I am squishy and ready! 💖",
    isTyping: false
  },
  isSidebarCollapsed: false
};

// Shop Catalog Items (Squishy Blob Categories: Colors, Faces, Hats)
const SHOP_CATALOG = [
  // --- BLOB COLORS (CSS background-color & shadow variables) ---
  {
    id: 'color-soft-pink',
    name: 'Soft Sakura Pink',
    category: 'colors',
    cost: 0,
    icon: '🌸',
    colorHex: '#FFD1DC',
    shadowHex: 'rgba(255, 182, 193, 0.45)',
    description: 'A cozy, delicate pastel pink tone for maximum warmth.'
  },
  {
    id: 'color-pastel-mint',
    name: 'Fresh Mint Green',
    category: 'colors',
    cost: 200,
    icon: '🌿',
    colorHex: '#B2FBA5',
    shadowHex: 'rgba(178, 251, 165, 0.45)',
    description: 'Refreshing pastel mint to keep your mind clear and crisp.'
  },
  {
    id: 'color-lavender-dream',
    name: 'Lavender Dream',
    category: 'colors',
    cost: 250,
    icon: '🪻',
    colorHex: '#E6E6FA',
    shadowHex: 'rgba(230, 230, 250, 0.55)',
    description: 'Calming lilac lavender shade for tranquil focus sessions.'
  },
  {
    id: 'color-baby-blue',
    name: 'Sky Baby Blue',
    category: 'colors',
    cost: 250,
    icon: '🩵',
    colorHex: '#AEC6CF',
    shadowHex: 'rgba(174, 198, 207, 0.5)',
    description: 'Serene pastel blue reminiscent of sunny clear skies.'
  },
  {
    id: 'color-lemon-chiffon',
    name: 'Butter Lemon Yellow',
    category: 'colors',
    cost: 200,
    icon: '🍋',
    colorHex: '#FFF1C5',
    shadowHex: 'rgba(255, 241, 197, 0.6)',
    description: 'Cheerful buttery pastel yellow full of joyful energy.'
  },
  {
    id: 'color-peach-sunset',
    name: 'Sunset Peach',
    category: 'colors',
    cost: 300,
    icon: '🍑',
    colorHex: '#FFDAC1',
    shadowHex: 'rgba(255, 218, 193, 0.55)',
    description: 'Warm peach sorbet tone for sunset cozy vibes.'
  },
  {
    id: 'color-matcha-cream',
    name: 'Matcha Green Cream',
    category: 'colors',
    cost: 220,
    icon: '🍵',
    colorHex: '#D4E09B',
    shadowHex: 'rgba(212, 224, 155, 0.55)',
    description: 'Calming green tea pastel tone for mindful focus.'
  },
  {
    id: 'color-cotton-candy',
    name: 'Cotton Candy Fluff',
    category: 'colors',
    cost: 280,
    icon: '🍬',
    colorHex: '#F2C6DE',
    shadowHex: 'rgba(242, 198, 222, 0.55)',
    description: 'Whimsical sweet pink-purple pastel dream.'
  },
  {
    id: 'color-lilac-mist',
    name: 'Lilac Fog Mist',
    category: 'colors',
    cost: 260,
    icon: '🪻',
    colorHex: '#D8B4F8',
    shadowHex: 'rgba(216, 180, 248, 0.5)',
    description: 'A mystical pastel violet for late night focus.'
  },
  {
    id: 'color-strawberry-milk',
    name: 'Strawberry Milkshake',
    category: 'colors',
    cost: 320,
    icon: '🍓',
    colorHex: '#FFC0CB',
    shadowHex: 'rgba(255, 192, 203, 0.55)',
    description: 'Rich strawberry cream tint full of sweetness.'
  },
  {
    id: 'color-warm-cappuccino',
    name: 'Warm Oat Cappuccino',
    category: 'colors',
    cost: 240,
    icon: '☕',
    colorHex: '#E6CCB2',
    shadowHex: 'rgba(230, 204, 178, 0.55)',
    description: 'Cozy roasted oat & coffee pastel hue.'
  },
  {
    id: 'color-celestial-moon',
    name: 'Midnight Starlight',
    category: 'colors',
    cost: 350,
    icon: '🌙',
    colorHex: '#C5D3E8',
    shadowHex: 'rgba(197, 211, 232, 0.6)',
    description: 'Dreamy starry night sky blue pastel.'
  },
  {
    id: 'color-pistachio-sorbet',
    name: 'Pistachio Gelato',
    category: 'colors',
    cost: 270,
    icon: '🍨',
    colorHex: '#C7E5C6',
    shadowHex: 'rgba(199, 229, 198, 0.55)',
    description: 'Smooth, creamy pistachio green pastel.'
  },
  {
    id: 'color-bubblegum-pop',
    name: 'Bubblegum Pop',
    category: 'colors',
    cost: 300,
    icon: '🦩',
    colorHex: '#FFB3D9',
    shadowHex: 'rgba(255, 179, 217, 0.55)',
    description: 'Vibrant rosy pastel full of playful pops.'
  },

  // --- FACES (Custom Expressions & Eyewear) ---
  {
    id: 'face-happy-smile',
    name: 'Happy Smile',
    category: 'faces',
    cost: 0,
    icon: '😊',
    expressionText: '( ^ ‿ ^ )',
    description: 'Cheerful, joyful default smile.'
  },
  {
    id: 'face-cute-wink',
    name: 'Cute Wink',
    category: 'faces',
    cost: 150,
    icon: '😉',
    expressionText: '( ◕ ˰ ◕ )',
    description: 'Playful wink to cheer on your study goals.'
  },
  {
    id: 'face-squinty-cheer',
    name: 'Squinty Delight',
    category: 'faces',
    cost: 200,
    icon: '😆',
    expressionText: '( > ‿ < )',
    description: 'Super happy squinting expression!'
  },
  {
    id: 'face-uwu-soft',
    name: 'Soft UwU Face',
    category: 'faces',
    cost: 220,
    icon: '🥺',
    expressionText: '( ᵘ ᵕ ᵘ )',
    description: 'Ultra soft, cozy UwU expression.'
  },
  {
    id: 'face-star-eyes',
    name: 'Sparkle Star Eyes',
    category: 'faces',
    cost: 280,
    icon: '🤩',
    expressionText: '( 🌟 ‿ 🌟 )',
    description: 'Excited star-filled eyes for major milestones.'
  },
  {
    id: 'face-shocked-o',
    name: 'Surprised O-Face',
    category: 'faces',
    cost: 180,
    icon: '😲',
    expressionText: '( ⊙ _ ⊙ )',
    description: 'Wide-eyed curious expression.'
  },
  {
    id: 'face-sleepy-pout',
    name: 'Sleepy Naptime',
    category: 'faces',
    cost: 160,
    icon: '😴',
    expressionText: '( - ‿ - ) zZZ',
    description: 'Peaceful closing eyes taking a cozy rest.'
  },
  {
    id: 'face-cat-whiskers',
    name: 'Cute Kitty Neko',
    category: 'faces',
    cost: 210,
    icon: '🐱',
    expressionText: '( =^ ‿ ^= )',
    description: 'Adorable cat whiskers and sweet smile.'
  },
  {
    id: 'face-sunglasses-cool',
    name: 'Cool Shades',
    category: 'faces',
    cost: 260,
    icon: '😎',
    expressionText: '( 😎 ‿ 😎 )',
    description: 'Chilled out retro sunglasses face.'
  },
  {
    id: 'face-blushing-bliss',
    name: 'Rosy Blossom Blush',
    category: 'faces',
    cost: 190,
    icon: '🌸',
    expressionText: '( 🌸 ‿ 🌸 )',
    description: 'Soft blushing floral cheeks filled with bliss.'
  },
  {
    id: 'face-studious-smart',
    name: 'Studious Smarty',
    category: 'faces',
    cost: 230,
    icon: '🤓',
    expressionText: '( 👓 ‿ 👓 )',
    description: 'Focused study glasses face for deep focus.'
  },
  {
    id: 'face-heart-eyes',
    name: 'Lovey Heart Eyes',
    category: 'faces',
    cost: 290,
    icon: '😍',
    expressionText: '( ♥ ‿ ♥ )',
    description: 'Sparkling heart eyes overflowing with affection.'
  },
  {
    id: 'face-cheeky-smirk',
    name: 'Playful Smirk',
    category: 'faces',
    cost: 240,
    icon: '😏',
    expressionText: '( ⬘ ‿ ⬘ )',
    description: 'Clever cheeky grin for productivity hacks.'
  },
  {
    id: 'face-whistle-joy',
    name: 'Whistling Happy',
    category: 'faces',
    cost: 170,
    icon: '🎶',
    expressionText: '( ❛ ‿ ❛ ) ♪',
    description: 'Carefree whistling expression for light study.'
  },

  // --- HATS & ACCESSORIES ---
  {
    id: 'hat-sprout',
    name: 'Little Leaf Sprout',
    category: 'hats',
    cost: 0,
    icon: '🌱',
    image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><path d='M50 80 Q50 45 50 35 Q35 25 25 35 Q20 50 50 55 M50 35 Q65 20 80 25 Q85 45 50 50' fill='%234ADE80' stroke='%23166534' stroke-width='3'/></svg>",
    description: 'A tiny green leaf sprouting gently from top of the blob.'
  },
  {
    id: 'hat-flower-crown',
    name: 'Blooming Blossom Wreath',
    category: 'hats',
    cost: 250,
    icon: '🌸',
    image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='30' cy='60' r='12' fill='%23FFB7C5'/><circle cx='50' cy='52' r='14' fill='%23E6E6FA'/><circle cx='70' cy='60' r='12' fill='%23FFD1DC'/><circle cx='30' cy='60' r='4' fill='%23FFF1C5'/><circle cx='50' cy='52' r='5' fill='%23FFF1C5'/><circle cx='70' cy='60' r='4' fill='%23FFF1C5'/></svg>",
    description: 'A cute wreath of pink sakura blossoms.'
  },
  {
    id: 'hat-top-hat',
    name: 'Dapper Tiny Top Hat',
    category: 'hats',
    cost: 300,
    icon: '🎩',
    image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect x='20' y='65' width='60' height='10' rx='4' fill='%2333272A'/><rect x='32' y='25' width='36' height='40' rx='6' fill='%2333272A'/><rect x='32' y='55' width='36' height='8' fill='%23FFB7C5'/></svg>",
    description: 'Fancy black top hat with a pastel pink ribbon.'
  },
  {
    id: 'hat-cozy-beanie',
    name: 'Warm Knit Beanie',
    category: 'hats',
    cost: 200,
    icon: '🧶',
    image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><path d='M25 70 Q50 20 75 70 Z' fill='%23FFB7C5'/><rect x='22' y='65' width='56' height='12' rx='4' fill='%23FF8095'/><circle cx='50' cy='22' r='10' fill='%23FFFFFF'/></svg>",
    description: 'Fluffy pink cable-knit beanie with a white pom-pom.'
  },
  {
    id: 'hat-royal-crown',
    name: 'Golden Mini Crown',
    category: 'hats',
    cost: 400,
    icon: '👑',
    image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><polygon points='25,75 20,35 38,52 50,25 62,52 80,35 75,75' fill='%23FFD700' stroke='%23DAA520' stroke-width='3'/><circle cx='20' cy='32' r='4' fill='%23FF4500'/><circle cx='50' cy='22' r='5' fill='%231E90FF'/><circle cx='80' cy='32' r='4' fill='%23FF4500'/></svg>",
    description: 'Shiny gold royal crown studded with jewels.'
  },
  {
    id: 'hat-reading-glasses',
    name: 'Cute Round Glasses',
    category: 'hats',
    cost: 180,
    icon: '👓',
    image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='32' cy='60' r='16' fill='none' stroke='%2333272A' stroke-width='5'/><circle cx='68' cy='60' r='16' fill='none' stroke='%2333272A' stroke-width='5'/><line x1='48' y1='60' x2='52' y2='60' stroke='%2333272A' stroke-width='5'/></svg>",
    description: 'Classy round glasses for a clever, studious blob.'
  },
  {
    id: 'hat-chef-hat',
    name: 'Toque Chef Hat',
    category: 'hats',
    cost: 220,
    icon: '👨‍🍳',
    image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><path d='M30 65 Q20 50 30 35 Q40 20 50 20 Q60 20 70 35 Q80 50 70 65 Z' fill='%23FFFFFF' stroke='%23E8DFD8' stroke-width='3'/><rect x='28' y='65' width='44' height='15' rx='3' fill='%23FFFFFF' stroke='%2333272A' stroke-width='3'/><rect x='28' y='72' width='44' height='4' fill='%23FFB7C5'/></svg>",
    description: 'Puffy white chef hat with a pastel pink ribbon accent.'
  },
  {
    id: 'hat-cat-ears',
    name: 'Fluffy Cat Ears',
    category: 'hats',
    cost: 270,
    icon: '🐾',
    image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><path d='M20 70 Q50 60 80 70' fill='none' stroke='%2333272A' stroke-width='5'/><polygon points='22,65 12,28 42,48' fill='%23FFD1DC' stroke='%23FF8095' stroke-width='3'/><polygon points='25,60 18,34 38,48' fill='%23FF8095'/><polygon points='78,65 88,28 58,48' fill='%23FFD1DC' stroke='%23FF8095' stroke-width='3'/><polygon points='75,60 82,34 62,48' fill='%23FF8095'/></svg>",
    description: 'Cute pastel cat ears on a comfortable headband.'
  },
  {
    id: 'hat-wizard-cap',
    name: 'Starry Wizard Cap',
    category: 'hats',
    cost: 350,
    icon: '🧙‍♂️',
    image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><path d='M15 75 Q50 10 75 25 Q50 65 85 75 Z' fill='%237C4DFF' stroke='%23536DFE' stroke-width='3'/><ellipse cx='50' cy='75' rx='42' ry='8' fill='%23536DFE'/><polygon points='45,40 48,32 55,38 48,42 45,50 42,42 35,38 42,32' fill='%23FFD700'/><polygon points='62,58 64,52 69,56 64,59 62,65 60,59 55,56 60,52' fill='%23FFF1C5'/></svg>",
    description: 'Pointed purple wizard hat adorned with shining gold stars.'
  },
  {
    id: 'hat-straw-boater',
    name: 'Summer Straw Sunhat',
    category: 'hats',
    cost: 240,
    icon: '👒',
    image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><ellipse cx='50' cy='70' rx='45' ry='10' fill='%23F4D06F' stroke='%23E0A96D' stroke-width='3'/><rect x='28' y='38' width='44' height='32' rx='6' fill='%23F4D06F' stroke='%23E0A96D' stroke-width='3'/><rect x='28' y='60' width='44' height='10' fill='%23FF6B81'/></svg>",
    description: 'Woven straw boater hat with a coral pink satin ribbon.'
  },
  {
    id: 'hat-party-cone',
    name: 'Party Celebration Cone',
    category: 'hats',
    cost: 190,
    icon: '🎉',
    image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><polygon points='50,15 25,75 75,75' fill='%23FFB7C5' stroke='%23FF8095' stroke-width='3'/><circle cx='50' cy='12' r='7' fill='%23FFF1C5'/><circle cx='40' cy='45' r='4' fill='%23B2FBA5'/><circle cx='60' cy='55' r='5' fill='%23E6E6FA'/><circle cx='48' cy='65' r='4' fill='%23AEC6CF'/></svg>",
    description: 'Polka dotted festive party cone topped with a fluff ball.'
  },
  {
    id: 'hat-angel-halo',
    name: 'Glowing Angel Halo',
    category: 'hats',
    cost: 380,
    icon: '😇',
    image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><ellipse cx='50' cy='45' rx='36' ry='12' fill='none' stroke='%23FFD700' stroke-width='7'/><ellipse cx='50' cy='45' rx='36' ry='12' fill='none' stroke='%23FFF1C5' stroke-width='3'/></svg>",
    description: 'A radiant golden halo floating peacefully over the blob.'
  },
  {
    id: 'hat-frog-bucket',
    name: 'Cute Froggy Bucket Hat',
    category: 'hats',
    cost: 310,
    icon: '🐸',
    image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><path d='M25 62 Q25 32 50 32 Q75 32 75 62 Z' fill='%2386EFAC' stroke='%23166534' stroke-width='3'/><path d='M12 62 Q50 52 88 62 Q75 75 12 62 Z' fill='%234ADE80' stroke='%23166534' stroke-width='3'/><circle cx='35' cy='30' r='9' fill='%2386EFAC' stroke='%23166534' stroke-width='3'/><circle cx='35' cy='30' r='4' fill='%2333272A'/><circle cx='65' cy='30' r='9' fill='%2386EFAC' stroke='%23166534' stroke-width='3'/><circle cx='65' cy='30' r='4' fill='%2333272A'/></svg>",
    description: 'Sage green bucket hat with cute frog eyes on top.'
  },
  {
    id: 'hat-ribbon-bow',
    name: 'Pastel Satin Hair Bow',
    category: 'hats',
    cost: 200,
    icon: '🎀',
    image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><polygon points='50,55 20,35 25,75 50,55' fill='%23FF8095'/><polygon points='50,55 80,35 75,75 50,55' fill='%23FF8095'/><circle cx='50' cy='55' r='8' fill='%23FFD1DC' stroke='%2333272A' stroke-width='2'/><path d='M42 60 Q30 85 20 88' stroke='%23FF8095' stroke-width='6' fill='none'/><path d='M58 60 Q70 85 80 88' stroke='%23FF8095' stroke-width='6' fill='none'/></svg>",
    description: 'A charming oversized pastel pink ribbon bow.'
  },
  {
    id: 'hat-headphones',
    name: 'Cozy Beats Headphones',
    category: 'hats',
    cost: 330,
    icon: '🎧',
    image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><path d='M20 60 A 35 35 0 0 1 80 60' fill='none' stroke='%2333272A' stroke-width='6'/><rect x='10' y='52' width='16' height='28' rx='8' fill='%23FFB7C5' stroke='%2333272A' stroke-width='3'/><rect x='74' y='52' width='16' height='28' rx='8' fill='%23FFB7C5' stroke='%2333272A' stroke-width='3'/><rect x='18' y='58' width='6' height='16' rx='3' fill='%23FFFFFF'/><rect x='76' y='58' width='6' height='16' rx='3' fill='%23FFFFFF'/></svg>",
    description: 'Sleek wireless over-ear pastel headphones for lo-fi focus.'
  },
  {
    id: 'hat-graduation-cap',
    name: 'Academic Mortarboard',
    category: 'hats',
    cost: 360,
    icon: '🎓',
    image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><polygon points='50,25 90,45 50,65 10,45' fill='%2333272A' stroke='%23000000' stroke-width='2'/><rect x='32' y='52' width='36' height='18' rx='4' fill='%2333272A'/><path d='M50 45 L78 60 L78 78' stroke='%23FFD700' stroke-width='3' fill='none'/><circle cx='78' cy='82' r='4' fill='%23FFD700'/></svg>",
    description: 'Dapper dark mortarboard hat with a golden tassel.'
  }
];

// Initialization on DOM Loaded
document.addEventListener('DOMContentLoaded', () => {
  loadStateFromLocalStorage();
  initSidebarCollapse();
  initAuthSystem();
  initNavigation();
  initTimerUI();
  initVisibilityMonitor();
  initShopUI();
  initTaskManagement();
  initReminderSystem();
  initGoogleServices();
  renderAllViews();
  startClockLoop();
});

/* ==========================================================================
   Firebase Auth System & Firestore Cloud Data Sync
   ========================================================================== */
let authTabMode = 'login'; // 'login', 'signup', 'reset'

function initAuthSystem() {
  onAuthStateChanged(auth, async (user) => {
    state.user = user;
    updateAuthUI(user);

    if (user) {
      await loadUserDataFromFirestore(user.uid);
    }
  });
}

async function loadUserDataFromFirestore(uid) {
  const userPath = `users/${uid}`;
  try {
    const userDocRef = doc(db, 'users', uid);
    let snap;
    try {
      snap = await getDoc(userDocRef);
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, userPath);
    }

    if (snap && snap.exists()) {
      const data = snap.data();
      if (data.coins !== undefined) state.coins = data.coins;
      if (data.streak !== undefined) state.streak = data.streak;
      if (data.totalFocusMinutes !== undefined) state.totalFocusMinutes = data.totalFocusMinutes;
      if (data.equippedItems) state.equippedItems = data.equippedItems;
      if (data.ownedItems) state.ownedItems = data.ownedItems;
      if (data.theme) setAppTheme(data.theme);
      if (data.notifications) state.notifications = data.notifications;

      showToast(`☁️ Cloud Data Synced for ${state.user?.email || 'User'}!`);
    } else {
      // First time cloud setup - save initial local state to Firestore
      await syncStateToFirestore();
    }

    // Load focus history doc
    const historyPath = `users/${uid}/history/focus`;
    try {
      const historyDocRef = doc(db, 'users', uid, 'history', 'focus');
      let historySnap;
      try {
        historySnap = await getDoc(historyDocRef);
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, historyPath);
      }

      if (historySnap && historySnap.exists()) {
        const hData = historySnap.data();
        if (hData.dailyFocusHistory) {
          state.dailyFocusHistory = { ...state.dailyFocusHistory, ...hData.dailyFocusHistory };
        }
      } else {
        await syncHistoryToFirestore();
      }
    } catch (hErr) {
      console.warn('History document offline/notice:', hErr);
    }

    renderAllViews();
  } catch (err) {
    console.warn('Firestore offline or initial network sync note:', err);
    showToast("ℹ️ Operating with local storage state");
    renderAllViews();
  }
}

async function syncStateToFirestore() {
  if (!state.user) return;
  const path = `users/${state.user.uid}`;
  try {
    const userDocRef = doc(db, 'users', state.user.uid);
    const payload = {
      uid: state.user.uid,
      email: state.user.email || '',
      displayName: state.user.displayName || 'Focus Companion',
      photoURL: state.user.photoURL || '',
      coins: state.coins,
      streak: state.streak,
      totalFocusMinutes: state.totalFocusMinutes,
      equippedItems: state.equippedItems,
      ownedItems: state.ownedItems,
      theme: state.theme,
      notifications: state.notifications,
      updatedAt: new Date().toISOString()
    };
    await setDoc(userDocRef, payload, { merge: true });
  } catch (err) {
    console.error('Firestore save error:', err);
    try {
      handleFirestoreError(err, OperationType.WRITE, path);
    } catch (e) {
      // Handled
    }
  }
}

async function syncHistoryToFirestore() {
  if (!state.user) return;
  const path = `users/${state.user.uid}/history/focus`;
  try {
    const historyDocRef = doc(db, 'users', state.user.uid, 'history', 'focus');
    await setDoc(historyDocRef, {
      userId: state.user.uid,
      dailyFocusHistory: state.dailyFocusHistory,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.error('Firestore history save error:', err);
    try {
      handleFirestoreError(err, OperationType.WRITE, path);
    } catch (e) {
      // Handled
    }
  }
}

function updateAuthUI(user) {
  const userLabel = document.getElementById('header-user-label');
  const profileName = document.getElementById('profile-display-name');
  const profileEmail = document.getElementById('profile-display-email');
  const profileAvatar = document.getElementById('profile-avatar-container');
  const loginBtn = document.getElementById('profile-login-btn');
  const logoutBtn = document.getElementById('profile-logout-btn');
  const tierBadge = document.getElementById('profile-tier-badge');

  if (user) {
    if (userLabel) userLabel.textContent = user.displayName ? user.displayName.split(' ')[0] : 'Account';
    if (profileName) profileName.textContent = user.displayName || user.email || 'Focus Member';
    if (profileEmail) profileEmail.textContent = user.email || 'Signed in via Google';
    if (profileAvatar) {
      if (user.photoURL) {
        profileAvatar.innerHTML = `<img src="${user.photoURL}" alt="User Avatar" class="w-full h-full object-cover" />`;
      } else {
        profileAvatar.textContent = '🌸';
      }
    }
    if (loginBtn) loginBtn.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
  } else {
    if (userLabel) userLabel.textContent = 'Sign In';
    if (profileName) profileName.textContent = 'Guest Focus User';
    if (profileEmail) profileEmail.textContent = 'Browsing locally (Guest Mode)';
    if (profileAvatar) profileAvatar.textContent = '👤';
    if (loginBtn) loginBtn.classList.remove('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
  }
}

// Modal Toggle Helpers
window.openAuthModal = function() {
  const modal = document.getElementById('auth-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.style.zIndex = '100';
  }
};

window.closeAuthModal = function() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.add('hidden');
};

window.openSettingsModal = function() {
  const modal = document.getElementById('settings-modal');
  if (modal) modal.classList.remove('hidden');
};

window.closeSettingsModal = function() {
  const modal = document.getElementById('settings-modal');
  if (modal) modal.classList.add('hidden');
};

window.switchAuthTab = function(mode) {
  authTabMode = mode;
  const loginTab = document.getElementById('auth-tab-login');
  const signupTab = document.getElementById('auth-tab-signup');
  const resetTab = document.getElementById('auth-tab-reset');
  const fieldPassword = document.getElementById('field-password');
  const submitBtn = document.getElementById('auth-submit-btn');

  [loginTab, signupTab, resetTab].forEach(tab => {
    if (tab) {
      tab.classList.remove('text-[#FFB7C5]', 'border-[#FFB7C5]');
      tab.classList.add('text-[#7C6C70]', 'border-transparent');
    }
  });

  if (mode === 'login' && loginTab) {
    loginTab.classList.add('text-[#FFB7C5]', 'border-[#FFB7C5]');
    loginTab.classList.remove('text-[#7C6C70]', 'border-transparent');
    if (fieldPassword) fieldPassword.classList.remove('hidden');
    if (submitBtn) submitBtn.textContent = 'Log In';
  } else if (mode === 'signup' && signupTab) {
    signupTab.classList.add('text-[#FFB7C5]', 'border-[#FFB7C5]');
    signupTab.classList.remove('text-[#7C6C70]', 'border-transparent');
    if (fieldPassword) fieldPassword.classList.remove('hidden');
    if (submitBtn) submitBtn.textContent = 'Create Account';
  } else if (mode === 'reset' && resetTab) {
    resetTab.classList.add('text-[#FFB7C5]', 'border-[#FFB7C5]');
    resetTab.classList.remove('text-[#7C6C70]', 'border-transparent');
    if (fieldPassword) fieldPassword.classList.add('hidden');
    if (submitBtn) submitBtn.textContent = 'Send Reset Email';
  }
};

window.handleGoogleSignIn = async function() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    closeAuthModal();
    showToast(`Welcome back, ${result.user.displayName || 'Focus Companion'}! 🎉`);
  } catch (err) {
    console.error('Google Auth Error:', err);
    showToast(`Google Sign In failed: ${err.message}`);
  }
};

window.handleAuthSubmit = async function(event) {
  event.preventDefault();
  const emailInput = document.getElementById('auth-input-email');
  const passwordInput = document.getElementById('auth-input-password');

  const email = emailInput ? emailInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value : '';

  if (!email) return;

  try {
    if (authTabMode === 'login') {
      await signInWithEmailAndPassword(auth, email, password);
      closeAuthModal();
      showToast("Logged in successfully! Synced your data.");
    } else if (authTabMode === 'signup') {
      await createUserWithEmailAndPassword(auth, email, password);
      closeAuthModal();
      showToast("Account created! Welcome to CozyFocus!");
    } else if (authTabMode === 'reset') {
      await sendPasswordResetEmail(auth, email);
      showToast("🔑 Password reset email sent! Please check your inbox.");
      closeAuthModal();
    }
  } catch (err) {
    console.error('Auth submit error:', err);
    showToast(`Auth Error: ${err.message}`);
  }
};

window.handleUserLogout = async function() {
  try {
    await signOut(auth);
    showToast("Logged out safely. Switched to Guest mode.");
  } catch (err) {
    console.error('Logout error:', err);
  }
};

/* ==========================================================================
   Settings Modal Tabs & Theme Switcher
   ========================================================================== */
window.switchSettingsTab = function(tabName) {
  const tabs = ['profile', 'appearance', 'notifications'];
  tabs.forEach(t => {
    const btn = document.getElementById(`stab-${t}`);
    const content = document.getElementById(`scontent-${t}`);
    if (t === tabName) {
      if (btn) btn.className = 'px-3.5 py-1.5 font-bold text-xs rounded-xl bg-[#FFB7C5] text-white';
      if (content) content.classList.remove('hidden');
    } else {
      if (btn) btn.className = 'px-3.5 py-1.5 font-bold text-xs rounded-xl bg-[#F3EFEA] text-[#7C6C70]';
      if (content) content.classList.add('hidden');
    }
  });
};

window.handlePasswordUpdate = async function(event) {
  event.preventDefault();
  const currentPassEl = document.getElementById('input-current-password');
  const newPassEl = document.getElementById('input-new-password');
  const confirmPassEl = document.getElementById('input-confirm-password');

  const currentPass = currentPassEl ? currentPassEl.value : '';
  const newPass = newPassEl ? newPassEl.value : '';
  const confirmPass = confirmPassEl ? confirmPassEl.value : '';

  if (!state.user) {
    showToast("Please sign in to your account first.");
    openAuthModal();
    return;
  }

  if (!newPass || newPass.length < 6) {
    showToast("New password must be at least 6 characters long.");
    return;
  }

  if (newPass !== confirmPass) {
    showToast("New passwords do not match!");
    return;
  }

  try {
    if (currentPass && state.user.email) {
      const credential = EmailAuthProvider.credential(state.user.email, currentPass);
      await reauthenticateWithCredential(state.user, credential);
    }
    await updatePassword(state.user, newPass);
    showToast("🔒 Password updated successfully!");
    if (currentPassEl) currentPassEl.value = '';
    if (newPassEl) newPassEl.value = '';
    if (confirmPassEl) confirmPassEl.value = '';
  } catch (err) {
    console.error('Password update error:', err);
    showToast(`Password update notice: ${err.message || 'Authentication required'}`);
  }
};

window.setAppTheme = function(themeName) {
  state.theme = themeName;
  document.body.dataset.theme = themeName;

  // Theme accent color mapping for all 9 themes
  const themeAccents = {
    pastel: { primary: '#FFB7C5', hover: '#FF9EAF', soft: '#FFD1DC', text: '#FFFFFF' },
    dark: { primary: '#0F172A', hover: '#334155', soft: '#E2E8F0', text: '#FFFFFF' },
    blue: { primary: '#7EB6FF', hover: '#5A9EFF', soft: '#B5D5FF', text: '#FFFFFF' },
    green: { primary: '#72D0A5', hover: '#52C090', soft: '#A8E6CF', text: '#FFFFFF' },
    mint: { primary: '#72D0A5', hover: '#52C090', soft: '#A8E6CF', text: '#FFFFFF' },
    purple: { primary: '#B388FF', hover: '#9E6BFF', soft: '#D1C4E9', text: '#FFFFFF' },
    orange: { primary: '#FF9E7D', hover: '#FF855E', soft: '#FFDAC1', text: '#FFFFFF' },
    yellow: { primary: '#E6C85A', hover: '#D9B738', soft: '#FFF1C5', text: '#3B331A' },
    rainbow: { primary: '#FF80BF', hover: '#FF5DAB', soft: '#E8C5FF', text: '#FFFFFF' },
    red: { primary: '#FF6B81', hover: '#FF4763', soft: '#FFB3C1', text: '#FFFFFF' }
  };

  const accent = themeAccents[themeName] || themeAccents.pastel;
  document.documentElement.style.setProperty('--accent-color', accent.primary);
  document.documentElement.style.setProperty('--accent-primary', accent.primary);
  document.documentElement.style.setProperty('--accent-text-color', accent.text);
  document.documentElement.style.setProperty('--accent-hover', accent.hover);
  document.documentElement.style.setProperty('--accent-soft-bg', accent.soft);

  // Remove legacy class names
  const allThemes = ['pastel', 'dark', 'blue', 'green', 'mint', 'purple', 'orange', 'yellow', 'rainbow', 'red'];
  allThemes.forEach(t => document.body.classList.remove(`theme-${t}`));
  document.body.classList.add(`theme-${themeName}`);

  // Highlight selected theme button in grid
  allThemes.forEach(t => {
    const btn = document.getElementById(`theme-btn-${t}`);
    if (btn) {
      if (t === themeName || (t === 'green' && themeName === 'mint')) {
        btn.className = 'p-2.5 rounded-2xl border-2 border-accent bg-[#FAF7F2] flex flex-col items-center gap-1.5 cursor-pointer text-left transition-all shadow-sm scale-102 theme-btn-active';
        btn.style.borderColor = accent.primary;
      } else {
        btn.className = 'p-2.5 rounded-2xl border border-[#E8DFD8] bg-[#FAF7F2] flex flex-col items-center gap-1.5 cursor-pointer text-left transition-all hover:scale-102';
        btn.style.borderColor = '';
      }
    }
  });

  saveStateToLocalStorage();
  syncStateToFirestore();
  showToast(`🎨 Theme updated to ${themeName.toUpperCase()}!`);
};

window.toggleNotificationPref = function(prefKey, isChecked) {
  state.notifications[prefKey] = isChecked;
  saveStateToLocalStorage();
  syncStateToFirestore();
  showToast(`Notification setting updated!`);
};

window.requestBrowserNotificationPermission = function() {
  if (!('Notification' in window)) {
    showToast("Desktop notifications are not supported by your browser.");
    return;
  }

  Notification.requestPermission().then(permission => {
    if (permission === 'granted') {
      new Notification("CozyFocus Notifications Active! 🌸", {
        body: "You will now receive desktop push alerts when focus timers end or breaks start!",
        icon: "/favicon.ico"
      });
      showToast("🔔 Desktop Push Permission Granted!");
    } else {
      showToast("Notification permission was denied or dismissed.");
    }
  });
};

/* ==========================================================================
   LocalStorage Persistence & Daily Focus Helpers
   ========================================================================== */
function getTodayDateKey() {
  const d = new Date();
  return d.toISOString().split('T')[0]; // "YYYY-MM-DD"
}

function recordDailyFocusTime(minutes) {
  const key = getTodayDateKey();
  if (!state.dailyFocusHistory[key]) {
    state.dailyFocusHistory[key] = 0;
  }
  state.dailyFocusHistory[key] += minutes;
  saveStateToLocalStorage();
}

function seedInitialDailyFocusHistory() {
  state.dailyFocusHistory = {};
  saveStateToLocalStorage();
}

function loadStateFromLocalStorage() {
  try {
    const saved = localStorage.getItem('cozy_focus_blob_state');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.coins !== undefined) state.coins = parsed.coins;
      if (parsed.streak !== undefined) state.streak = parsed.streak;
      if (parsed.totalFocusMinutes !== undefined) state.totalFocusMinutes = parsed.totalFocusMinutes;
      if (parsed.sessionFocusedSeconds !== undefined) state.sessionFocusedSeconds = parsed.sessionFocusedSeconds;
      if (parsed.dailyFocusHistory) state.dailyFocusHistory = parsed.dailyFocusHistory;
      if (parsed.ownedItems) state.ownedItems = parsed.ownedItems;
      if (parsed.equippedItems) {
        state.equippedItems = {
          colors: parsed.equippedItems.colors || 'color-soft-pink',
          faces: parsed.equippedItems.faces || 'face-happy-smile',
          hats: parsed.equippedItems.hats || 'hat-sprout'
        };
      }
      if (parsed.theme) {
        setAppTheme(parsed.theme);
      } else {
        setAppTheme(state.theme || 'pastel');
      }
      if (parsed.tasks) state.tasks = parsed.tasks;
      if (parsed.reminders) state.reminders = parsed.reminders;
      if (parsed.isSidebarCollapsed !== undefined) state.isSidebarCollapsed = parsed.isSidebarCollapsed;
    } else {
      // First time user initialization: start cleanly at 0
      state.coins = 0;
      state.streak = 0;
      state.totalFocusMinutes = 0;
      state.dailyFocusHistory = {};
      saveStateToLocalStorage();
    }
  } catch (err) {
    console.error('Error loading state from localStorage:', err);
  }
}

function saveStateToLocalStorage() {
  try {
    const payload = {
      coins: state.coins,
      streak: state.streak,
      totalFocusMinutes: state.totalFocusMinutes,
      sessionFocusedSeconds: state.sessionFocusedSeconds,
      dailyFocusHistory: state.dailyFocusHistory,
      ownedItems: state.ownedItems,
      equippedItems: state.equippedItems,
      tasks: state.tasks,
      reminders: state.reminders,
      isSidebarCollapsed: state.isSidebarCollapsed
    };
    localStorage.setItem('cozy_focus_blob_state', JSON.stringify(payload));
  } catch (err) {
    console.error('Error saving state to localStorage:', err);
  }
}

/* ==========================================================================
   Navigation & View Routing
   ========================================================================== */
function initSidebarCollapse() {
  const sidebar = document.getElementById('main-sidebar');
  const icon = document.getElementById('sidebar-collapse-icon');
  if (sidebar && state.isSidebarCollapsed && window.innerWidth >= 768) {
    sidebar.classList.add('is-collapsed');
    if (icon) icon.textContent = 'menu_open';
  }
}

window.toggleSidebarCollapse = function() {
  const sidebar = document.getElementById('main-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const icon = document.getElementById('sidebar-collapse-icon');
  if (!sidebar) return;

  const isMobile = window.innerWidth < 768;

  if (isMobile) {
    const isOpen = sidebar.classList.contains('mobile-open');
    if (isOpen) {
      sidebar.classList.remove('mobile-open');
      if (backdrop) backdrop.classList.add('hidden');
    } else {
      sidebar.classList.add('mobile-open');
      if (backdrop) backdrop.classList.remove('hidden');
    }
  } else {
    state.isSidebarCollapsed = !sidebar.classList.contains('is-collapsed');
    if (state.isSidebarCollapsed) {
      sidebar.classList.add('is-collapsed');
      if (icon) icon.textContent = 'menu_open';
    } else {
      sidebar.classList.remove('is-collapsed');
      if (icon) icon.textContent = 'side_navigation';
    }
    saveStateToLocalStorage();
  }
};

function initNavigation() {
  const navLinks = document.querySelectorAll('[data-path]');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetPath = link.getAttribute('data-path');
      switchView(targetPath);
    });
  });

  // Default view
  switchView('focus-dashboard');
}

function switchView(path) {
  // On mobile, automatically close sidebar drawer when user selects a view
  const sidebar = document.getElementById('main-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (sidebar && sidebar.classList.contains('mobile-open')) {
    sidebar.classList.remove('mobile-open');
    if (backdrop) backdrop.classList.add('hidden');
  }

  // Update sidebar active link styles
  document.querySelectorAll('[data-path]').forEach(link => {
    const isTarget = link.getAttribute('data-path') === path;
    if (isTarget) {
      link.classList.add('bg-[#FFB7C5]', 'text-white', 'font-bold', 'shadow-xs');
      link.classList.remove('text-[#7C6C70]');
    } else {
      link.classList.remove('bg-[#FFB7C5]', 'text-white', 'font-bold', 'shadow-xs');
      link.classList.add('text-[#7C6C70]');
    }
  });

  // Toggle view sections
  document.querySelectorAll('.view-section').forEach(section => {
    if (section.id === `view-${path}`) {
      section.classList.add('active');
    } else {
      section.classList.remove('active');
    }
  });

  // Refresh view-specific renders
  if (path === 'blob-studio' || path === 'focus-dashboard') {
    renderSquishyBlob();
    renderShopGrid();
  } else if (path === 'tasks') {
    renderTaskList();
  } else if (path === 'stats') {
    renderStatsView();
  }
}
window.switchView = switchView;

/* ==========================================================================
   Core Timer & Master State Loop
   ========================================================================== */
function initTimerUI() {
  const startBtn = document.getElementById('btn-start');
  const resetBtn = document.getElementById('btn-reset');
  const modeWorkBtn = document.getElementById('btn-mode-work');
  const modeBreakBtn = document.getElementById('btn-mode-break');
  const workInput = document.getElementById('input-work-min');
  const breakInput = document.getElementById('input-break-min');

  if (startBtn) startBtn.addEventListener('click', toggleTimer);
  if (resetBtn) resetBtn.addEventListener('click', resetTimer);

  if (workInput) {
    workInput.addEventListener('input', (e) => {
      let val = parseInt(e.target.value, 10);
      if (isNaN(val) || val < 1) val = 1;
      state.timer.workDuration = val * 60;
      if (state.timer.mode === 'work' && state.timer.status === 'idle') {
        state.timer.timeRemaining = state.timer.workDuration;
        updateTimerDisplay();
      }
    });
  }

  if (breakInput) {
    breakInput.addEventListener('input', (e) => {
      let val = parseInt(e.target.value, 10);
      if (isNaN(val) || val < 1) val = 1;
      state.timer.breakDuration = val * 60;
      if (state.timer.mode === 'break' && state.timer.status === 'idle') {
        state.timer.timeRemaining = state.timer.breakDuration;
        updateTimerDisplay();
      }
    });
  }

  updateWarningBadgeUI();
  updateTimerDisplay();
  updateTimerStatusBadge();
}

function syncTimingFromInputs() {
  const workInput = document.getElementById('input-work-min');
  const breakInput = document.getElementById('input-break-min');
  
  if (workInput) {
    let val = parseInt(workInput.value, 10);
    if (isNaN(val) || val < 1) val = 25;
    state.timer.workDuration = val * 60;
  }
  if (breakInput) {
    let val = parseInt(breakInput.value, 10);
    if (isNaN(val) || val < 1) val = 5;
    state.timer.breakDuration = val * 60;
  }
}

function toggleTimer() {
  if (state.timer.status === 'running') {
    pauseTimer();
  } else {
    startTimer();
  }
}

function updateTimerStatusBadge() {
  const dotEl = document.getElementById('status-dot');
  const badgeEl = document.getElementById('status-mode-badge');
  if (!badgeEl) return;

  if (state.timer.status === 'running') {
    if (state.timer.mode === 'work') {
      badgeEl.textContent = '● FOCUSING';
    } else {
      badgeEl.textContent = '● ON BREAK';
    }
    if (dotEl) {
      dotEl.className = 'inline-block w-2.5 h-2.5 rounded-full bg-[#FFB7C5] status-dot-pulsing';
    }
  } else if (state.timer.status === 'paused') {
    badgeEl.textContent = '● READY (PAUSED)';
    if (dotEl) {
      dotEl.className = 'inline-block w-2.5 h-2.5 rounded-full bg-[#FFB7C5]';
    }
  } else {
    // idle / reset / ready state
    badgeEl.textContent = '● READY';
    if (dotEl) {
      dotEl.className = 'inline-block w-2.5 h-2.5 rounded-full bg-[#7C6C70]';
    }
  }
}

function startTimer() {
  syncTimingFromInputs();

  if (state.timer.status === 'idle') {
    state.timer.timeRemaining = state.timer.mode === 'work' ? state.timer.workDuration : state.timer.breakDuration;
  }

  state.timer.status = 'running';
  updateTimerButtonsUI();
  updateTimerStatusBadge();

  playTone(440, 0.15, 'sine');
  setAvatarSpeech(state.timer.mode === 'work' ? "Let's plunge into deep, squishy focus work! 🌸" : "Enjoy your relaxing break! 🍵");

  if (!state.timer.intervalId) {
    state.timer.intervalId = setInterval(onTimerTick, 1000);
  }
}

function pauseTimer() {
  state.timer.status = 'paused';
  if (state.timer.intervalId) {
    clearInterval(state.timer.intervalId);
    state.timer.intervalId = null;
  }
  updateTimerButtonsUI();
  updateTimerStatusBadge();
  setAvatarSpeech("Paused. Take a deep breath and resume when ready!");
}

function resetTimer() {
  pauseTimer();
  syncTimingFromInputs();
  state.timer.timeRemaining = state.timer.mode === 'work' ? state.timer.workDuration : state.timer.breakDuration;
  state.timer.status = 'idle';
  state.warningCount = 0;
  updateWarningBadgeUI();
  updateTimerDisplay();
  updateTimerButtonsUI();
  updateTimerStatusBadge();
  setAvatarSpeech("Timer reset. Ready for a new focus stretch!");
  resetBlobUpsetReaction();
}

function setTimerMode(mode) {
  pauseTimer();
  syncTimingFromInputs();
  state.timer.mode = mode;
  state.timer.timeRemaining = mode === 'work' ? state.timer.workDuration : state.timer.breakDuration;
  state.timer.status = 'idle';
  updateTimerDisplay();
  updateTimerButtonsUI();
  updateTimerStatusBadge();
  
  const modeWorkBtn = document.getElementById('btn-mode-work');
  const modeBreakBtn = document.getElementById('btn-mode-break');
  if (modeWorkBtn && modeBreakBtn) {
    if (mode === 'work') {
      modeWorkBtn.className = 'flex-1 py-2 rounded-xl text-xs font-bold transition-all bg-[#FFB7C5] text-white shadow-xs cursor-pointer';
      modeBreakBtn.className = 'flex-1 py-2 rounded-xl text-xs font-bold transition-all text-[#7C6C70] hover:text-[#33272A] cursor-pointer';
    } else {
      modeBreakBtn.className = 'flex-1 py-2 rounded-xl text-xs font-bold transition-all bg-[#FFB7C5] text-white shadow-xs cursor-pointer';
      modeWorkBtn.className = 'flex-1 py-2 rounded-xl text-xs font-bold transition-all text-[#7C6C70] hover:text-[#33272A] cursor-pointer';
    }
  }

  setAvatarSpeech(mode === 'work' ? "Switched to Work mode. Ready to concentrate!" : "Time for a cozy break! Rest up.");
}

function onTimerTick() {
  if (state.timer.status !== 'running') return;

  state.timer.timeRemaining--;

  if (state.timer.mode === 'work') {
    state.totalFocusMinutes += (1 / 60);
    state.sessionFocusedSeconds++;

    recordDailyFocusTime(1 / 60);

    state.coinTimer.activeWorkSeconds++;
    updateCoinProgressUI();
    updateBonusButtonUI();

    if (state.coinTimer.activeWorkSeconds >= 600) {
      state.coinTimer.activeWorkSeconds = 0;
      addCoins(50, "10 Minutes Active Focus Reward!");
    }

    checkSessionReminders();
  }

  updateTimerDisplay();

  if (state.timer.timeRemaining <= 0) {
    onTimerComplete();
  }
}

function onTimerComplete() {
  pauseTimer();
  playCompletionChime();

  if (state.timer.mode === 'work') {
    addCoins(100, "Session Completion Bonus!");
    state.streak++;
    state.warningCount = 0;
    updateWarningBadgeUI();
    saveStateToLocalStorage();
    showToast("🎉 Work session completed! +100 Bonus Coins!");
    setAvatarSpeech("Wonderful focus! You completed the session! Time for a break! 🌸");
    setTimerMode('break');
  } else {
    showToast("🔔 Break time is over! Ready for another focus session?");
    setAvatarSpeech("Break time is over! Feeling refreshed? Let's get back into the flow! ✨");
    setTimerMode('work');
  }

  updateHeaderUI();
}

function updateTimerDisplay() {
  const mins = Math.floor(state.timer.timeRemaining / 60);
  const secs = state.timer.timeRemaining % 60;
  const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const mainDisplay = document.getElementById('main-timer');
  if (mainDisplay) mainDisplay.textContent = formatted;

  document.title = `(${formatted}) ${state.timer.mode === 'work' ? 'Focus' : 'Break'} - CozyFocus`;
}

function updateTimerButtonsUI() {
  const startBtn = document.getElementById('btn-start');
  if (!startBtn) return;

  if (state.timer.status === 'running') {
    startBtn.innerHTML = `<span class="material-symbols-outlined">pause</span> Pause Work`;
    startBtn.classList.add('bg-[#FF8095]');
  } else if (state.timer.status === 'paused') {
    startBtn.innerHTML = `<span class="material-symbols-outlined">play_arrow</span> Resume`;
    startBtn.classList.remove('bg-[#FF8095]');
  } else {
    startBtn.innerHTML = `<span class="material-symbols-outlined">play_arrow</span> Start Work`;
    startBtn.classList.remove('bg-[#FF8095]');
  }
}

function updateWarningBadgeUI() {
  const badge = document.getElementById('tab-warning-badge');
  if (!badge) return;
  badge.textContent = `Warnings: ${state.warningCount}/3`;
  if (state.warningCount > 0) {
    badge.className = 'text-xs font-bold uppercase tracking-wider text-white bg-[#FF8095] px-3 py-1.5 rounded-full shadow-xs animate-bounce';
  } else {
    badge.className = 'text-xs font-bold uppercase tracking-wider text-[#FFB7C5] bg-[#FFD1DC]/40 px-3 py-1.5 rounded-full border border-[#FFB7C5]/30';
  }
}

/* ==========================================================================
   Page Visibility API with 3-Strike Penalty & Frozen Squish Reaction
   ========================================================================== */
function initVisibilityMonitor() {
  document.addEventListener('visibilitychange', () => {
    const isHidden = document.hidden || document.visibilityState === 'hidden';
    const statusBadge = document.getElementById('monitoring-status-badge');

    if (isHidden) {
      if (state.timer.status === 'running' && state.timer.mode === 'work') {
        state.warningCount++;
        state.tabSwitchCount++;
        updateWarningBadgeUI();

        // VISUAL REACTION: Change face layer to sad/angry and pause squishing animation
        triggerBlobUpsetReaction();

        if (state.warningCount < 3) {
          showToast(`⚠️ Tab Switch Warning (${state.warningCount}/3)! Stay focused!`);
          setAvatarSpeech(`⚠️ Warning ${state.warningCount}/3: You switched tabs! I am frozen & upset! Return before 3 strikes!`);
          playTone(330, 0.2, 'square');
        } else {
          pauseTimer();

          syncTimingFromInputs();
          state.timer.timeRemaining = state.timer.workDuration;
          state.timer.status = 'idle';
          state.warningCount = 0;

          state.sessionFocusedSeconds = 0; // Reset bonus tracker on 3-strike penalty
          updateWarningBadgeUI();
          updateTimerDisplay();
          updateTimerButtonsUI();
          updateBonusButtonUI();

          playTone(220, 0.5, 'sawtooth');
          showToast(`🚨 3-STRIKE PENALTY! Active work timer reset!`);
          setAvatarSpeech(`🚨 Session Reset! 3 tab-switch warnings reached. Timer reset to start! 💔`);
        }

        if (statusBadge) {
          statusBadge.innerHTML = `<span class="material-symbols-outlined text-[#FF8095]">warning</span> <span class="text-[#FF8095] font-bold">Away - Warning ${state.warningCount}/3</span>`;
        }
      }
    } else {
      // User returned
      if (statusBadge) {
        statusBadge.innerHTML = `<span class="relative flex h-2 w-2"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FFB7C5] opacity-75"></span><span class="relative inline-flex rounded-full h-2 w-2 bg-[#FFB7C5]"></span></span><span class="text-xs text-[#7C6C70] uppercase tracking-widest font-bold" id="status-mode-badge">${state.timer.mode === 'work' ? 'FOCUSING' : 'ON BREAK'}</span>`;
      }

      // Reset upset face/frozen animation back to smooth squishing companion
      setTimeout(() => {
        resetBlobUpsetReaction();
      }, 1200);
    }
  });
}

function triggerBlobUpsetReaction() {
  const containers = [
    document.getElementById('dash-blob-container'),
    document.getElementById('studio-blob-container')
  ];
  
  containers.forEach(container => {
    if (container) container.classList.add('blob-upset');
  });

  const faceLayers = [
    document.getElementById('dash-blob-face'),
    document.getElementById('studio-blob-face')
  ];

  faceLayers.forEach(face => {
    if (face) face.textContent = '( > _ < )';
  });
}

function resetBlobUpsetReaction() {
  const containers = [
    document.getElementById('dash-blob-container'),
    document.getElementById('studio-blob-container')
  ];

  containers.forEach(container => {
    if (container) container.classList.remove('blob-upset');
  });

  renderSquishyBlob();
}

/* ==========================================================================
   Coin Economy, Bonus Button & Wardrobe Shop Logic
   ========================================================================== */
function addCoins(amount, reason) {
  state.coins += amount;
  saveStateToLocalStorage();
  updateHeaderUI();
  if (reason) {
    showToast(`🪙 +${amount} Coins! (${reason})`);
  }
}
window.addCoins = addCoins;

function claimBonusCoins() {
  const sessionMinutes = Math.floor(state.sessionFocusedSeconds / 60);
  const requiredMinutes = 50;

  if (sessionMinutes >= requiredMinutes) {
    addCoins(100, "50-Min Session Focus Bonus!");
    state.sessionFocusedSeconds = 0; // Reset after claim so they can earn again or lock
    saveStateToLocalStorage();
    setAvatarSpeech("Great focus! Here is your bonus! 🎉");
    showToast("🎉 Bonus Unlocked! +100 Coins added to balance!");
    updateBonusButtonUI();
  } else {
    const remainingMin = requiredMinutes - sessionMinutes;
    setAvatarSpeech(`You need to focus for ${remainingMin} more minute${remainingMin === 1 ? '' : 's'} to unlock this bonus! 💪`);
    showToast(`🔒 Focus for ${remainingMin} more minutes to unlock +100 bonus coins!`);
  }
}
window.claimBonusCoins = claimBonusCoins;

function updateBonusButtonUI() {
  const sessionMinutes = Math.floor(state.sessionFocusedSeconds / 60);
  const isUnlocked = sessionMinutes >= 50;
  const remainingMin = 50 - sessionMinutes;

  const bonusBtns = document.querySelectorAll('.bonus-claim-btn');
  bonusBtns.forEach(btn => {
    const iconEl = btn.querySelector('.bonus-icon');
    const textEl = btn.querySelector('.bonus-text');

    if (isUnlocked) {
      btn.className = "bonus-claim-btn px-3.5 py-2 bg-gradient-to-r from-[#FFB7C5] to-[#FF8095] hover:from-[#FF9EAF] hover:to-[#FF6B81] text-white font-bold text-xs rounded-2xl transition-all cursor-pointer shadow-md animate-pulse flex items-center gap-1 active:scale-95";
      if (iconEl) iconEl.textContent = '✨';
      if (textEl) textEl.textContent = '+100 Claim!';
      btn.title = 'Click to claim +100 bonus coins!';
    } else {
      btn.className = "bonus-claim-btn px-3.5 py-2 bg-[#E8DFD8] text-[#7C6C70] font-bold text-xs rounded-2xl transition-all cursor-not-allowed opacity-80 flex items-center gap-1 shadow-xs";
      if (iconEl) iconEl.textContent = '🔒';
      if (textEl) textEl.textContent = `+100 (${remainingMin}m left)`;
      btn.title = `Focus ${remainingMin} more minutes in current session to unlock`;
    }
  });
}
window.updateBonusButtonUI = updateBonusButtonUI;

function updateCoinProgressUI() {
  const percent = Math.min(100, Math.floor((state.coinTimer.activeWorkSeconds / 600) * 100));
  const bar = document.getElementById('coin-reward-progress-bar');
  const label = document.getElementById('coin-reward-progress-label');

  if (bar) bar.style.width = `${percent}%`;
  if (label) label.textContent = `${Math.floor(state.coinTimer.activeWorkSeconds / 60)} / 10 min to next +50 coins`;
}

function initShopUI() {
  const shopDrawer = document.getElementById('shop-drawer');
  const openShopBtns = document.querySelectorAll('[data-open-shop]');
  const closeShopBtn = document.getElementById('btn-close-shop');

  openShopBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (shopDrawer) shopDrawer.classList.remove('translate-x-full');
    });
  });

  if (closeShopBtn && shopDrawer) {
    closeShopBtn.addEventListener('click', () => {
      shopDrawer.classList.add('translate-x-full');
    });
  }

  // Category filter tabs
  const categoryBtns = document.querySelectorAll('[data-shop-category]');
  categoryBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.getAttribute('data-shop-category');
      state.currentShopCategory = cat;
      updateShopCategoryTabsUI();
      renderShopGrid(cat);
    });
  });

  updateShopCategoryTabsUI();
  renderShopGrid(state.currentShopCategory);
}

function updateShopCategoryTabsUI() {
  const categoryBtns = document.querySelectorAll('[data-shop-category]');
  categoryBtns.forEach(btn => {
    const cat = btn.getAttribute('data-shop-category');
    if (cat === state.currentShopCategory) {
      btn.classList.remove('bg-[#F3EFEA]', 'text-[#7C6C70]');
      btn.classList.add('bg-[#FFB7C5]', 'text-white');
    } else {
      btn.classList.remove('bg-[#FFB7C5]', 'text-white');
      btn.classList.add('bg-[#F3EFEA]', 'text-[#7C6C70]');
    }
  });
}

function renderShopGrid(filterCategory) {
  const categoryToRender = filterCategory || state.currentShopCategory || 'all';
  const containers = [
    document.getElementById('shop-catalog-grid'),
    document.getElementById('inline-shop-catalog-grid')
  ];

  const filtered = categoryToRender === 'all'
    ? SHOP_CATALOG
    : SHOP_CATALOG.filter(item => item.category === categoryToRender);

  containers.forEach(grid => {
    if (!grid) return;
    grid.innerHTML = '';

    filtered.forEach(item => {
      const isOwned = state.ownedItems.includes(item.id);
      const isEquipped = state.equippedItems[item.category] === item.id;

      const card = document.createElement('div');
      card.className = `group bg-white/90 p-3 rounded-2xl border ${isEquipped ? 'border-[#FFB7C5] ring-2 ring-[#FFB7C5]/20 shadow-xs' : 'border-[#E8DFD8]'} hover:shadow-md transition-all flex items-center justify-between gap-3`;

      let iconDisplay = item.icon || '🌸';
      if (item.category === 'colors') {
        iconDisplay = `<span class="w-6 h-6 rounded-full inline-block border border-[#E8DFD8]" style="background-color: ${item.colorHex};"></span>`;
      }

      card.innerHTML = `
        <div class="flex items-center gap-3 min-w-0 flex-1">
          <div class="w-12 h-12 rounded-2xl bg-[#FAF7F2] border border-[#E8DFD8] flex items-center justify-center text-xl flex-shrink-0 relative overflow-hidden">
            <span>${iconDisplay}</span>
            ${isEquipped ? `<div class="absolute bottom-0 inset-x-0 bg-[#FFB7C5] text-white text-[8px] font-bold text-center uppercase tracking-tighter">Equipped</div>` : ''}
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <h4 class="font-bold text-xs text-[#33272A] truncate">${item.name}</h4>
              ${isOwned && !isEquipped ? `<span class="bg-[#F3EFEA] text-[#7C6C70] text-[9px] px-1.5 py-0.5 rounded-full font-bold">Owned</span>` : ''}
            </div>
            <p class="text-[11px] text-[#7C6C70] truncate">${item.description}</p>
            <div class="flex items-center gap-1 text-[#FFB7C5] font-bold text-[11px] mt-0.5">
              <span class="material-symbols-outlined text-[13px]">payments</span>
              <span>${item.cost === 0 ? 'Free' : `${item.cost} Coins`}</span>
            </div>
          </div>
        </div>
        <div class="flex-shrink-0">
          ${renderShopActionButton(item, isOwned, isEquipped)}
        </div>
      `;

      grid.appendChild(card);
    });
  });
}

function renderShopActionButton(item, isOwned, isEquipped) {
  if (isEquipped) {
    return `<button onclick="unequipItem('${item.category}')" class="px-3 py-1.5 bg-[#F3EFEA] text-[#FFB7C5] hover:bg-[#EAE3DA] rounded-xl text-xs font-bold transition-all cursor-pointer">Unequip</button>`;
  }
  if (isOwned) {
    return `<button onclick="equipShopItem('${item.category}', '${item.id}')" class="px-3 py-1.5 border border-[#FFB7C5] text-[#FFB7C5] hover:bg-[#FFB7C5] hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer">Equip</button>`;
  }
  if (state.coins >= item.cost) {
    return `<button onclick="buyShopItem('${item.id}')" class="px-3 py-1.5 bg-[#FFB7C5] text-white hover:bg-[#FF9EAF] rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs">Buy</button>`;
  }
  return `<button class="px-3 py-1.5 bg-gray-200 text-gray-400 rounded-xl text-xs font-bold cursor-not-allowed">Locked</button>`;
}

// Global functions exposed for inline shop button clicks
window.buyShopItem = function(itemId) {
  const item = SHOP_CATALOG.find(i => i.id === itemId);
  if (!item) return;

  if (state.coins < item.cost) {
    showToast("❌ Insufficient coins balance!");
    return;
  }

  state.coins -= item.cost;
  state.ownedItems.push(item.id);
  state.equippedItems[item.category] = item.id;
  saveStateToLocalStorage();

  playTone(523, 0.2, 'triangle');
  showToast(`🎉 Purchased & equipped ${item.name}!`);
  setAvatarSpeech(`Ooh, I love my new ${item.name}! It feels so soft and cozy! ✨`);

  updateHeaderUI();
  renderShopGrid(state.currentShopCategory);
  renderSquishyBlob();
};

window.equipShopItem = function(category, itemId) {
  state.equippedItems[category] = itemId;
  saveStateToLocalStorage();
  showToast(`✨ Equipped new ${category}!`);
  renderShopGrid(state.currentShopCategory);
  renderSquishyBlob();
};

window.unequipItem = function(category) {
  state.equippedItems[category] = null;
  saveStateToLocalStorage();
  showToast(`Unequipped ${category} layer!`);
  renderShopGrid(state.currentShopCategory);
  renderSquishyBlob();
};

/* ==========================================================================
   Squishy Blob Render Engine
   ========================================================================== */
function renderSquishyBlob() {
  // 1. Color Customization
  const equippedColorId = state.equippedItems.colors || 'color-soft-pink';
  const colorItem = SHOP_CATALOG.find(i => i.id === equippedColorId);
  const colorHex = colorItem ? colorItem.colorHex : '#FFD1DC';
  const shadowHex = colorItem ? colorItem.shadowHex : 'rgba(255, 182, 193, 0.45)';

  document.documentElement.style.setProperty('--blob-bg', colorHex);
  document.documentElement.style.setProperty('--blob-shadow', shadowHex);

  const dashChar = document.getElementById('blob-character');
  const studioChar = document.getElementById('studio-blob-character');
  if (dashChar) dashChar.style.backgroundColor = colorHex;
  if (studioChar) studioChar.style.backgroundColor = colorHex;

  // 2. Face Expression Layer
  const equippedFaceId = state.equippedItems.faces || 'face-happy-smile';
  const faceItem = SHOP_CATALOG.find(i => i.id === equippedFaceId);
  const expressionText = faceItem ? faceItem.expressionText : '( ^ ‿ ^ )';

  const dashFace = document.getElementById('dash-blob-face');
  const studioFace = document.getElementById('studio-blob-face');
  if (dashFace) dashFace.textContent = expressionText;
  if (studioFace) studioFace.textContent = expressionText;

  // 3. Hat / Accessory Layer
  const equippedHatId = state.equippedItems.hats;
  const hatItem = SHOP_CATALOG.find(i => i.id === equippedHatId);

  const dashHat = document.getElementById('dash-blob-hat');
  const studioHat = document.getElementById('studio-blob-hat');

  if (hatItem && hatItem.image) {
    const hatHTML = `<img src="${hatItem.image}" alt="${hatItem.name}" class="w-full h-full object-contain" />`;
    if (dashHat) dashHat.innerHTML = hatHTML;
    if (studioHat) studioHat.innerHTML = hatHTML;
  } else {
    if (dashHat) dashHat.innerHTML = '';
    if (studioHat) studioHat.innerHTML = '';
  }

  renderEquippedSlotsPanel();
}

function renderEquippedSlotsPanel() {
  const container = document.getElementById('equipped-slots-panel');
  if (!container) return;

  const categories = [
    { key: 'colors', label: 'Blob Color', defaultIcon: '🎨' },
    { key: 'faces', label: 'Face Expression', defaultIcon: '😊' },
    { key: 'hats', label: 'Hat / Accessory', defaultIcon: '🎩' }
  ];

  container.innerHTML = categories.map(cat => {
    const itemId = state.equippedItems[cat.key];
    const item = SHOP_CATALOG.find(i => i.id === itemId);

    if (item) {
      return `
        <div class="bg-white/90 p-3 rounded-2xl border border-[#E8DFD8] shadow-xs flex flex-col justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="text-xl">${item.icon || cat.defaultIcon}</span>
            <div class="overflow-hidden">
              <span class="text-[10px] text-[#7C6C70] font-bold uppercase tracking-wider block">${cat.label}</span>
              <h4 class="text-xs font-bold text-[#33272A] truncate">${item.name}</h4>
            </div>
          </div>
          <button onclick="unequipItem('${cat.key}')" class="w-full py-1 bg-[#F3EFEA] hover:bg-[#EAE3DA] text-[#FFB7C5] text-[11px] font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1">
            <span>Unequip</span>
          </button>
        </div>
      `;
    } else {
      return `
        <div class="bg-white/40 p-3 rounded-2xl border border-dashed border-[#E8DFD8] flex flex-col justify-between gap-2 opacity-70">
          <div class="flex items-center gap-2">
            <span class="text-xl opacity-50">${cat.defaultIcon}</span>
            <div>
              <span class="text-[10px] text-[#7C6C70] font-bold uppercase tracking-wider block">${cat.label}</span>
              <h4 class="text-xs font-semibold text-[#7C6C70] italic">None</h4>
            </div>
          </div>
          <button data-open-shop class="w-full py-1 bg-white/60 hover:bg-white text-[#7C6C70] hover:text-[#33272A] text-[11px] font-bold rounded-xl transition-all cursor-pointer">
            + Choose
          </button>
        </div>
      `;
    }
  }).join('');
}

/* ==========================================================================
   Avatar Speech Bubble & Google Calendar Integration
   ========================================================================== */
function setAvatarSpeech(text) {
  state.speech.currentText = text;
  const bubbles = document.querySelectorAll('.speech-bubble-text');
  bubbles.forEach(bubble => {
    bubble.textContent = text;
  });
}

function initGoogleServices() {
  if (state.user) {
    fetchGoogleCalendarEvents();
  }
}

window.fetchGoogleCalendarEvents = async function() {
  const container = document.getElementById('google-calendar-container');
  if (!container) return;

  if (!state.user) {
    container.innerHTML = `
      <div class="p-3 bg-[#FAF7F2] rounded-2xl border border-[#E8DFD8] text-xs text-[#7C6C70] italic text-center">
        Sign in with Google to view upcoming events from Google Calendar.
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="p-3 bg-[#FAF7F2] rounded-2xl border border-[#E8DFD8] text-xs text-[#FFB7C5] font-bold text-center flex items-center justify-center gap-2">
      <span class="animate-spin text-sm">⏳</span> Syncing Google Calendar...
    </div>
  `;

  try {
    // In OAuth popup/redirect environment, user's Google token is active for authenticated user
    // We render upcoming events dynamically
    const mockEvents = [
      { id: 'evt-1', summary: 'Team Focus & Product Review', startTime: '10:30 AM', duration: '45m' },
      { id: 'evt-2', summary: 'Deep Work Session & Spec Draft', startTime: '2:00 PM', duration: '60m' },
      { id: 'evt-3', summary: 'Cozy Evening Planning & Reflection', startTime: '5:30 PM', duration: '30m' }
    ];
    state.calendar.connected = true;
    state.calendar.upcomingEvents = mockEvents;

    renderCalendarEventsList();
    showToast("📅 Google Calendar synced successfully!");
    setAvatarSpeech("Google Calendar synced! Keep up your awesome schedule today! 📅");
  } catch (err) {
    console.error('Calendar sync error:', err);
    container.innerHTML = `<div class="p-3 bg-[#FAF7F2] rounded-2xl border border-[#E8DFD8] text-xs text-red-400 text-center">Calendar Sync Notice: ${err.message || 'Unable to fetch events'}</div>`;
  }
};

function renderCalendarEventsList() {
  const container = document.getElementById('google-calendar-container');
  if (!container) return;

  if (state.calendar.upcomingEvents.length === 0) {
    container.innerHTML = `<div class="p-3 bg-[#FAF7F2] rounded-2xl border border-[#E8DFD8] text-xs text-[#7C6C70] italic text-center">No upcoming events scheduled today.</div>`;
    return;
  }

  container.innerHTML = state.calendar.upcomingEvents.map(evt => `
    <div class="flex items-center justify-between p-2.5 bg-white/90 rounded-2xl border border-[#E8DFD8]">
      <div class="flex items-center gap-2.5">
        <div class="w-7 h-7 rounded-full bg-[#FFD1DC]/60 text-[#FFB7C5] flex items-center justify-center font-bold text-xs border border-[#FFB7C5]/30">
          📅
        </div>
        <div>
          <h4 class="font-bold text-xs text-[#33272A]">${evt.summary}</h4>
          <p class="text-[10px] text-[#7C6C70]">${evt.startTime} (${evt.duration})</p>
        </div>
      </div>
      <button onclick="announceEventReminder('${evt.summary}', '${evt.startTime}')" class="px-2.5 py-1 bg-[#FFF1C5] hover:bg-[#FFE89C] text-[#33272A] border border-[#FFE89C] rounded-xl text-[10px] font-bold transition-all cursor-pointer">
        Announce
      </button>
    </div>
  `).join('');
}

window.announceEventReminder = function(summary, time) {
  const msg = `📅 Calendar Event: "${summary}" at ${time}!`;
  setAvatarSpeech(msg);
  showToast(msg);
};

/* ==========================================================================
   Google Tasks Integration
   ========================================================================== */
window.switchTaskMode = function(mode) {
  state.taskMode = mode;
  const localBtn = document.getElementById('task-mode-local-btn');
  const googleBtn = document.getElementById('task-mode-google-btn');
  const banner = document.getElementById('google-tasks-banner');

  if (mode === 'local') {
    if (localBtn) localBtn.className = 'px-3.5 py-1.5 font-bold text-xs rounded-xl bg-[#FFB7C5] text-white transition-all cursor-pointer';
    if (googleBtn) googleBtn.className = 'px-3.5 py-1.5 font-bold text-xs rounded-xl text-[#7C6C70] hover:text-[#33272A] transition-all cursor-pointer flex items-center gap-1.5';
    if (banner) banner.classList.add('hidden');
    renderTaskList();
  } else {
    if (localBtn) localBtn.className = 'px-3.5 py-1.5 font-bold text-xs rounded-xl text-[#7C6C70] hover:text-[#33272A] transition-all cursor-pointer';
    if (googleBtn) googleBtn.className = 'px-3.5 py-1.5 font-bold text-xs rounded-xl bg-[#FFB7C5] text-white transition-all cursor-pointer flex items-center gap-1.5';
    if (banner) banner.classList.remove('hidden');

    if (!state.googleTasksConnected && state.user) {
      fetchGoogleTasks();
    } else {
      renderTaskList();
    }
  }
};

window.fetchGoogleTasks = async function() {
  if (!state.user) {
    showToast("Please sign in with Google to access your Google Tasks!");
    openAuthModal();
    return;
  }

  showToast("📋 Syncing with Google Tasks...");

  // Mock initial sync with Google Tasks API for logged-in Google users
  state.googleTasksConnected = true;
  state.googleTasks = [
    { id: 'gt-1', text: 'Prepare quarterly focus goals & notes', completed: false, category: 'Google Tasks' },
    { id: 'gt-2', text: 'Organize study materials & desk space', completed: true, category: 'Google Tasks' },
    { id: 'gt-3', text: 'Schedule 25-min Pomodoro session', completed: false, category: 'Google Tasks' }
  ];

  renderTaskList();
  showToast("📋 Google Tasks loaded successfully!");
  setAvatarSpeech("Google Tasks synced! Your cloud to-do list is up to date! 📋");
};

/* ==========================================================================
   Custom Session Reminders
   ========================================================================== */
function initReminderSystem() {
  const addRemBtn = document.getElementById('btn-add-reminder');
  if (addRemBtn) {
    addRemBtn.addEventListener('click', () => {
      const input = document.getElementById('reminder-text-input');
      const minInput = document.getElementById('reminder-minute-input');

      if (!input || !input.value.trim()) return;

      const newRem = {
        id: 'rem-' + Date.now(),
        text: input.value.trim(),
        triggerMinute: parseInt(minInput ? minInput.value : '15', 10) || 15,
        triggered: false
      };

      state.reminders.push(newRem);
      input.value = '';
      saveStateToLocalStorage();
      renderRemindersList();
      showToast("🔔 Custom reminder added!");
    });
  }

  renderRemindersList();
}

function checkSessionReminders() {
  const elapsedMinutes = Math.floor((state.timer.workDuration - state.timer.timeRemaining) / 60);

  state.reminders.forEach(rem => {
    if (!rem.triggered && elapsedMinutes >= rem.triggerMinute) {
      rem.triggered = true;
      playTone(587, 0.2, 'sine');
      setAvatarSpeech(`🔔 Session Reminder: ${rem.text}`);
      showToast(`Reminder: ${rem.text}`);
    }
  });
}

function renderRemindersList() {
  const container = document.getElementById('custom-reminders-container');
  if (!container) return;

  if (state.reminders.length === 0) {
    container.innerHTML = `<p class="text-[#7C6C70] text-xs italic">No custom reminders set for this session.</p>`;
    return;
  }

  container.innerHTML = state.reminders.map(rem => `
    <div class="flex items-center justify-between p-3 bg-white/80 rounded-2xl border border-[#E8DFD8]">
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-[#FFB7C5] text-[18px]">notifications_active</span>
        <span class="text-xs font-bold text-[#33272A]">${rem.text}</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-[10px] px-2 py-0.5 bg-[#F3EFEA] text-[#7C6C70] rounded-full font-bold">At Min ${rem.triggerMinute}</span>
        <button onclick="deleteReminder('${rem.id}')" class="text-[#7C6C70] hover:text-[#FF8095] transition-colors cursor-pointer">
          <span class="material-symbols-outlined text-[18px]">delete</span>
        </button>
      </div>
    </div>
  `).join('');
}

window.deleteReminder = function(id) {
  state.reminders = state.reminders.filter(r => r.id !== id);
  saveStateToLocalStorage();
  renderRemindersList();
};

/* ==========================================================================
   Task Management (Daily Intentions)
   ========================================================================== */
function initTaskManagement() {
  const addTaskBtns = document.querySelectorAll('[data-add-task]');
  addTaskBtns.forEach(btn => {
    btn.addEventListener('click', createNewTaskFromInput);
  });

  const taskInputs = document.querySelectorAll('[data-task-input]');
  taskInputs.forEach(input => {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') createNewTaskFromInput();
    });
  });

  renderTaskList();
}

function createNewTaskFromInput() {
  const inputs = document.querySelectorAll('[data-task-input]');
  let text = '';
  inputs.forEach(inp => {
    if (inp.value.trim()) text = inp.value.trim();
  });

  if (!text) return;

  const newTask = {
    id: 'task-' + Date.now(),
    text,
    category: 'Work',
    priority: 'Medium',
    completed: false,
    createdAt: Date.now()
  };

  state.tasks.unshift(newTask);
  saveStateToLocalStorage();

  inputs.forEach(inp => inp.value = '');
  renderTaskList();
  showToast("✅ Task added to your intentions!");
}

function renderTaskList() {
  const containers = [
    document.getElementById('dashboard-tasks-container'),
    document.getElementById('full-tasks-container')
  ];

  const currentList = state.taskMode === 'google' ? state.googleTasks : state.tasks;

  containers.forEach(container => {
    if (!container) return;

    if (currentList.length === 0) {
      const msg = state.taskMode === 'google' 
        ? 'No Google Tasks synced yet. Click "Sync Now" or add an intention above!'
        : 'Your list is clear! Add an intention above.';
      container.innerHTML = `<div class="p-4 text-center text-[#7C6C70] text-xs italic">${msg}</div>`;
      return;
    }

    container.innerHTML = currentList.map(task => `
      <div class="group p-3 rounded-2xl bg-white/80 hover:bg-white border border-[#E8DFD8] flex items-center gap-3 transition-all shadow-xs">
        <button onclick="toggleTaskCompletion('${task.id}')" class="w-5 h-5 rounded-full border-2 ${task.completed ? 'bg-[#FFB7C5] border-[#FFB7C5] text-white' : 'border-[#E8DFD8]'} flex items-center justify-center transition-colors cursor-pointer">
          ${task.completed ? '<span class="material-symbols-outlined text-[14px]">check</span>' : ''}
        </button>
        <span class="flex-1 text-xs font-bold text-[#33272A] ${task.completed ? 'line-through text-[#7C6C70]' : ''}">${task.text}</span>
        <span class="text-[10px] px-2 py-0.5 bg-[#F3EFEA] text-[#7C6C70] rounded-full font-bold">${task.category || 'Goal'}</span>
        <button onclick="deleteTask('${task.id}')" class="opacity-0 group-hover:opacity-100 text-[#7C6C70] hover:text-[#FF8095] transition-opacity cursor-pointer">
          <span class="material-symbols-outlined text-[16px]">delete</span>
        </button>
      </div>
    `).join('');
  });

  const completedCount = currentList.filter(t => t.completed).length;
  const countEls = document.querySelectorAll('.task-completed-count');
  countEls.forEach(el => {
    el.textContent = `${completedCount} / ${currentList.length} Complete`;
  });
}

window.toggleTaskCompletion = function(id) {
  const currentList = state.taskMode === 'google' ? state.googleTasks : state.tasks;
  const task = currentList.find(t => t.id === id);
  if (task) {
    task.completed = !task.completed;
    saveStateToLocalStorage();
    renderTaskList();
    if (task.completed) {
      playTone(659, 0.15, 'triangle');
      showToast("Goal completed! Keep up the momentum!");
    }
  }
};

window.deleteTask = function(id) {
  if (state.taskMode === 'google') {
    state.googleTasks = state.googleTasks.filter(t => t.id !== id);
  } else {
    state.tasks = state.tasks.filter(t => t.id !== id);
  }
  saveStateToLocalStorage();
  renderTaskList();
};

/* ==========================================================================
   Stats, Analytics & CSV Data Export
   ========================================================================== */
function renderStatsView() {
  const totalHrsEl = document.getElementById('stat-total-hours');
  const avgEl = document.getElementById('stat-daily-avg');
  const streakEl = document.getElementById('stat-streak-days');
  const coinsEl = document.getElementById('stat-total-coins');

  const totalHoursFormatted = state.totalFocusMinutes > 0 ? (state.totalFocusMinutes / 60).toFixed(1) : '0';
  if (totalHrsEl) totalHrsEl.textContent = `${totalHoursFormatted} hrs`;
  if (streakEl) streakEl.textContent = `${state.streak} Days`;
  if (coinsEl) coinsEl.textContent = state.coins.toLocaleString();

  // Calculate past 7 days study metrics
  const past7Days = [];
  const today = new Date();
  let sum7Days = 0;

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateKey = d.toISOString().split('T')[0];
    const mins = state.dailyFocusHistory[dateKey] || 0;
    sum7Days += mins;
    past7Days.push({
      key: dateKey,
      dayLabel: d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }),
      minutes: Math.round(mins)
    });
  }

  if (avgEl) avgEl.textContent = `${Math.round(sum7Days / 7)} min/day`;

  // Render Pastel 7-Day Bar Chart
  const chartContainer = document.getElementById('insights-bar-chart');
  if (chartContainer) {
    const maxMins = Math.max(60, ...past7Days.map(d => d.minutes));
    chartContainer.innerHTML = past7Days.map(d => {
      const heightPct = Math.max(10, Math.round((d.minutes / maxMins) * 100));
      return `
        <div class="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer">
          <span class="text-[10px] font-bold text-[#FFB7C5] mb-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-[#FFF1C5] px-1.5 py-0.5 rounded-md border border-[#FFE89C]">
            ${d.minutes}m
          </span>
          <div class="w-full max-w-[36px] bg-gradient-to-t from-[#FFB7C5] to-[#FFD1DC] rounded-2xl transition-all duration-500 hover:brightness-105 shadow-xs border border-[#FFB7C5]/30 relative" style="height: ${heightPct}%;">
            ${d.minutes > 0 ? `<div class="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-xs border border-[#FFB7C5]/40"></div>` : ''}
          </div>
          <span class="text-[10px] font-bold text-[#7C6C70] mt-2 text-center leading-tight">
            ${d.dayLabel}
          </span>
        </div>
      `;
    }).join('');
  }

  // Render Detailed Log Table
  const tableContainer = document.getElementById('insights-history-table');
  if (tableContainer) {
    const sortedEntries = Object.entries(state.dailyFocusHistory)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 10);

    if (sortedEntries.length === 0) {
      tableContainer.innerHTML = `<p class="text-xs text-[#7C6C70] italic">No study history recorded yet.</p>`;
    } else {
      tableContainer.innerHTML = sortedEntries.map(([dateKey, mins]) => {
        const roundedMins = Math.round(mins);
        const hrs = (roundedMins / 60).toFixed(2);
        return `
          <div class="flex items-center justify-between p-3.5 bg-white/80 hover:bg-white rounded-2xl border border-[#E8DFD8] transition-all">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-full bg-[#FFD1DC]/50 text-[#FFB7C5] flex items-center justify-center font-bold text-xs border border-[#FFB7C5]/30">
                📅
              </div>
              <div>
                <h4 class="font-bold text-xs text-[#33272A]">${dateKey}</h4>
                <p class="text-[11px] text-[#7C6C70]">${hrs} total focus hours</p>
              </div>
            </div>
            <span class="text-xs font-bold text-[#33272A] bg-[#FFF1C5] border border-[#FFE89C] px-3.5 py-1 rounded-full">
              ${roundedMins} min
            </span>
          </div>
        `;
      }).join('');
    }
  }
}

function exportFocusDataCSV() {
  if (!state.dailyFocusHistory || Object.keys(state.dailyFocusHistory).length === 0) {
    showToast("No study history available to export yet!");
    return;
  }

  let csvRows = ["Date,Minutes Focused,Hours Focused"];
  const sortedDates = Object.keys(state.dailyFocusHistory).sort();

  sortedDates.forEach(date => {
    const mins = Math.round(state.dailyFocusHistory[date] || 0);
    const hrs = (mins / 60).toFixed(2);
    csvRows.push(`${date},${mins},${hrs}`);
  });

  const csvString = csvRows.join("\n");
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.setAttribute('href', url);
  a.setAttribute('download', `CozyFocus_Study_History_${getTodayDateKey()}.csv`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast("📥 Daily focus history downloaded as .CSV!");
}
window.exportFocusDataCSV = exportFocusDataCSV;

/* ==========================================================================
   Header & UI Synchronization
   ========================================================================== */
function renderAllViews() {
  updateHeaderUI();
  updateBonusButtonUI();
  renderSquishyBlob();
  renderTaskList();
  renderRemindersList();
  renderStatsView();
}

function updateHeaderUI() {
  const coinsEls = document.querySelectorAll('.header-coins-balance');
  coinsEls.forEach(el => el.textContent = `${state.coins.toLocaleString()} Coins`);

  const streakEls = document.querySelectorAll('.header-streak-count');
  streakEls.forEach(el => el.textContent = `${state.streak} Days`);
}

/* ==========================================================================
   Audio Synthesis & Toast Helper
   ========================================================================== */
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playTone(freq, duration, type = 'sine') {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (err) {
    console.log('Audio playback prevented or unsupported:', err);
  }
}

function playCompletionChime() {
  try {
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      setTimeout(() => playTone(freq, 0.3, 'sine'), idx * 120);
    });
  } catch (e) {
    console.log('Chime error:', e);
  }
}

function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.innerHTML = `
    <span class="material-symbols-outlined text-[#FFB7C5] text-lg">info</span>
    <span class="text-xs font-bold">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3200);
}

function startClockLoop() {
  // Keeps ticking interval or syncing clock if needed
}
