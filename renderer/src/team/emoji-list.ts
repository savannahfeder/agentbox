// EVERY EMOJI ON OFFER BEHIND THE "+" (w-45cbac227a). Asked for as "like in
// Slack ... you can typically hit Plus and then see a more complete list. We
// don't necessarily need everything." So not all ~3,700: the ones people send
// at work and in a friendly chat, in the groups every picker uses, each with
// the words you would type to find it. Skin tones and flags are left out.
//
// Each entry is the emoji, then the words it answers to, space separated.

export type EmojiGroup = { name: string; icon: string; emoji: [string, string][] };

const g = (name: string, icon: string, list: string): EmojiGroup => ({
  name,
  icon,
  emoji: list.trim().split('\n').map((row) => {
    const [emoji, ...words] = row.trim().split(' ');
    return [emoji, words.join(' ')] as [string, string];
  }),
});

export const EMOJI_GROUPS: EmojiGroup[] = [
  g('Smileys', '😀', `
    😀 grin smile happy
    😃 smile happy joy
    😄 smile happy laugh
    😁 grin beam teeth
    😆 laugh lol squint
    😅 sweat relief nervous laugh
    🤣 rofl rolling laugh
    😂 joy tears laugh lol
    🙂 slight smile
    🙃 upside down silly
    😉 wink
    😊 blush smile happy
    😇 halo angel innocent
    🥰 love hearts adore
    😍 heart eyes love
    🤩 star struck wow
    😘 kiss blow
    😋 yum tasty
    😛 tongue
    😜 wink tongue crazy
    🤪 zany crazy goofy
    🤑 money rich
    🤗 hug hugs
    🤭 oops giggle
    🤫 shush quiet secret
    🤔 think thinking hmm
    🤐 zip quiet
    🤨 raised eyebrow skeptical
    😐 neutral meh
    😑 expressionless blank
    😶 no mouth speechless
    😏 smirk
    😒 unamused
    🙄 eye roll
    😬 grimace awkward yikes
    😮‍💨 exhale sigh relief
    😌 relieved calm
    😔 pensive sad
    😪 sleepy
    😴 sleep zzz tired
    😷 mask sick
    🤒 thermometer sick ill
    🤯 mind blown exploding wow
    🥳 party celebrate birthday
    😎 cool sunglasses
    🤓 nerd geek
    🧐 monocle inspect curious
    😕 confused
    😟 worried
    🙁 frown sad
    😮 open mouth surprise
    😯 hushed surprise
    😲 astonished shock
    😳 flushed embarrassed
    🥺 pleading puppy please
    🥹 holding back tears grateful
    😢 cry sad tear
    😭 sob crying
    😱 scream fear
    😖 confounded
    😣 persevere struggle
    😞 disappointed
    😓 sweat downcast
    😩 weary tired
    😫 tired exhausted
    🥱 yawn bored tired
    😤 triumph huff
    😡 angry mad rage
    😠 angry mad
    🤬 swearing cursing
    💀 skull dead lol
    💩 poop
    🤡 clown
    👻 ghost boo
    👽 alien
    🤖 robot bot
    😺 cat smile
    🫠 melting
    🫡 salute respect
    🫣 peek
    🫢 gasp
  `),
  g('People', '👋', `
    👋 wave hello hi bye
    🤚 raised back hand
    ✋ hand high five stop
    🖖 vulcan
    👌 ok okay perfect
    🤌 pinched italian
    🤏 pinch small tiny
    ✌️ victory peace
    🤞 fingers crossed luck hope
    🫰 snap
    🤟 love you
    🤘 rock horns
    🤙 call me shaka
    👈 point left
    👉 point right
    👆 point up
    👇 point down
    ☝️ index up one
    👍 thumbs up yes good like +1
    👎 thumbs down no bad -1
    ✊ fist
    👊 punch fist bump
    🤛 left fist bump
    🤜 right fist bump
    👏 clap applause bravo
    🙌 raised hands hooray praise
    🫶 heart hands love
    👐 open hands
    🤲 palms up
    🤝 handshake deal agree
    🙏 pray please thanks thank you
    ✍️ writing write
    💪 muscle strong flex
    🧠 brain smart think
    👀 eyes look looking see
    👁️ eye
    👄 mouth lips
    🙋 raising hand me
    🙆 ok gesture
    🙅 no gesture
    🤷 shrug dunno whatever
    🤦 facepalm
    🙇 bow sorry
    💁 tipping hand
    🧑‍💻 developer coder laptop
    🧑‍🎨 artist designer
    🧑‍🚀 astronaut
    🕵️ detective investigate
    🏃 run running
    🚶 walk walking
    🧘 yoga calm meditate
    💃 dance dancer
    🕺 dance disco
    👯 party dancing
    🫂 hug people
    👶 baby
    🧙 wizard magic
    🥷 ninja
    🦸 hero superhero
  `),
  g('Hearts and symbols', '❤️', `
    ❤️ heart love red
    🧡 orange heart
    💛 yellow heart
    💚 green heart
    💙 blue heart
    💜 purple heart
    🖤 black heart
    🤍 white heart
    🤎 brown heart
    💔 broken heart sad
    ❤️‍🔥 heart on fire
    💕 two hearts love
    💖 sparkling heart
    💯 hundred 100 perfect
    ✅ check done yes tick
    ☑️ check box ballot
    ✔️ check mark
    ❌ cross no wrong x
    ❎ cross box
    ➕ plus add
    ➖ minus
    ❓ question
    ❗ exclamation important
    ‼️ double exclamation
    ⁉️ interrobang
    ⚠️ warning caution
    🚫 prohibited no forbidden
    ⛔ no entry stop
    🔴 red circle
    🟠 orange circle
    🟡 yellow circle
    🟢 green circle
    🔵 blue circle
    🟣 purple circle
    ⚫ black circle
    ⚪ white circle
    ⭐ star favourite
    🌟 glowing star
    ✨ sparkles new magic
    💫 dizzy
    💥 boom collision
    🔥 fire hot lit
    💬 speech bubble comment
    💭 thought bubble
    🗯️ anger bubble
    💤 zzz sleep
    🆗 ok button
    🆕 new
    🆒 cool
    🔝 top
    🔜 soon
    ♻️ recycle
    ➡️ right arrow
    ⬅️ left arrow
    ⬆️ up arrow
    ⬇️ down arrow
    🔁 repeat
    🔄 refresh sync
    ⏩ fast forward
    ⏸️ pause
    ⏹️ stop
    ▶️ play
  `),
  g('Animals and nature', '🐶', `
    🐶 dog puppy
    🐱 cat kitten
    🐭 mouse
    🐹 hamster
    🐰 rabbit bunny
    🦊 fox
    🐻 bear
    🐼 panda
    🐨 koala
    🐯 tiger
    🦁 lion
    🐮 cow
    🐷 pig
    🐸 frog
    🐵 monkey
    🙈 see no evil monkey
    🙉 hear no evil
    🙊 speak no evil
    🐔 chicken
    🐧 penguin
    🐦 bird
    🦆 duck
    🦉 owl
    🦄 unicorn
    🐝 bee busy
    🐛 bug caterpillar
    🦋 butterfly
    🐌 snail slow
    🐢 turtle slow
    🐍 snake
    🐙 octopus
    🦀 crab
    🐳 whale
    🐬 dolphin
    🦈 shark
    🐘 elephant
    🦒 giraffe
    🦥 sloth slow
    🐿️ squirrel
    🌵 cactus
    🌲 evergreen tree
    🌳 tree
    🌴 palm tree
    🌱 seedling sprout grow
    🌿 herb
    🍀 clover luck
    🍁 maple leaf autumn
    🍂 fallen leaves fall
    🌸 cherry blossom flower
    🌹 rose
    🌻 sunflower
    🌷 tulip
    🌈 rainbow
    ☀️ sun sunny
    🌤️ sun cloud
    ☁️ cloud
    🌧️ rain
    ⛈️ storm thunder
    ❄️ snow snowflake cold
    ⚡ lightning zap fast
    🌊 wave ocean
    🌙 moon night
    🌍 earth globe world
  `),
  g('Food and drink', '🍕', `
    🍏 green apple
    🍎 apple red
    🍊 orange tangerine
    🍋 lemon
    🍌 banana
    🍉 watermelon
    🍇 grapes
    🍓 strawberry
    🫐 blueberries
    🍒 cherries
    🍑 peach
    🥭 mango
    🍍 pineapple
    🥥 coconut
    🥑 avocado
    🍆 eggplant
    🥕 carrot
    🌽 corn
    🌶️ hot pepper spicy
    🥦 broccoli
    🍄 mushroom
    🥐 croissant
    🍞 bread
    🥯 bagel
    🧀 cheese
    🥚 egg
    🍳 cooking fried egg
    🥞 pancakes
    🥓 bacon
    🍔 burger hamburger
    🍟 fries
    🍕 pizza
    🌭 hot dog
    🥪 sandwich
    🌮 taco
    🌯 burrito
    🥗 salad
    🍝 pasta spaghetti
    🍜 ramen noodles
    🍣 sushi
    🍱 bento
    🍿 popcorn
    🍩 donut doughnut
    🍪 cookie
    🎂 birthday cake
    🍰 cake slice
    🧁 cupcake
    🍫 chocolate
    🍬 candy
    🍦 ice cream
    ☕ coffee tea hot
    🍵 tea matcha
    🧋 boba bubble tea
    🥤 drink soda cup
    🍺 beer
    🍻 cheers beers
    🥂 cheers champagne toast
    🍷 wine
    🍸 cocktail
    🍾 champagne celebrate
  `),
  g('Activities', '⚽', `
    🎉 party tada celebrate hooray
    🎊 confetti celebrate
    🎈 balloon
    🎁 gift present
    🎀 ribbon
    🏆 trophy win winner
    🥇 gold medal first
    🥈 silver medal second
    🥉 bronze medal third
    🏅 medal
    🎯 bullseye target goal direct hit
    ⚽ soccer football
    🏀 basketball
    🏈 american football
    ⚾ baseball
    🎾 tennis
    🏐 volleyball
    🏓 ping pong
    🏸 badminton
    ⛳ golf
    🎳 bowling
    🏋️ weights lift gym
    🚴 bike cycling
    🏊 swim swimming
    🧗 climbing
    ⛷️ ski skiing
    🏄 surf surfing
    🎮 video game controller gaming
    🕹️ joystick
    🎲 dice game
    ♟️ chess
    🧩 puzzle piece
    🎨 art palette paint
    🎭 theatre drama
    🎬 film movie clapper
    🎤 microphone sing
    🎧 headphones music
    🎵 music note
    🎶 music notes
    🎸 guitar
    🎹 piano keyboard
    🥁 drum
    🎺 trumpet
    🎻 violin
    🪩 disco ball
  `),
  g('Travel and places', '✈️', `
    🚀 rocket launch ship fast
    ✈️ airplane plane flight travel
    🛫 departure takeoff
    🛬 arrival landing
    🚗 car
    🚕 taxi
    🚌 bus
    🚲 bicycle bike
    🛴 scooter
    🚂 train
    🚇 metro subway
    🚢 ship boat
    ⛵ sailboat
    🛶 canoe
    🚁 helicopter
    🛸 ufo
    🚦 traffic light
    🚧 construction wip
    ⚓ anchor
    🗺️ map
    🧭 compass direction
    🏔️ mountain snow
    ⛰️ mountain
    🏕️ camping
    🏖️ beach
    🏝️ island
    🏜️ desert
    🏠 house home
    🏡 garden home
    🏢 office building
    🏗️ building construction
    🏛️ classical building
    🏰 castle
    🗽 statue liberty
    🗼 tower
    🌉 bridge
    🌆 city dusk
    🌃 night city
    🎡 ferris wheel
    🎢 roller coaster
    ⛲ fountain
    🌅 sunrise
    🌄 sunrise mountains
    🌌 milky way
  `),
  g('Objects', '💡', `
    💡 idea light bulb
    📌 pin pushpin
    📍 location pin
    📎 paperclip attach
    🔗 link
    ✏️ pencil edit
    🖊️ pen
    🖍️ crayon
    📝 memo note write
    📄 page document
    📃 page curl
    📑 bookmark tabs
    📊 bar chart stats
    📈 chart up growth
    📉 chart down decline
    🗂️ dividers folders
    📁 folder
    📂 open folder
    📅 calendar date
    📆 tear off calendar
    🗓️ spiral calendar schedule
    📋 clipboard
    🗒️ notepad
    📚 books
    📖 book read
    🔖 bookmark
    💼 briefcase work
    🧾 receipt
    💰 money bag
    💵 dollar money
    💳 credit card
    💸 money flying spend
    📦 package box ship
    📬 mailbox mail
    📧 email
    ✉️ envelope letter
    📨 incoming mail
    📮 postbox
    📣 megaphone announce
    📢 loudspeaker
    🔔 bell notification
    🔕 bell off mute
    💻 laptop computer
    🖥️ desktop computer
    ⌨️ keyboard
    🖱️ mouse
    📱 phone mobile
    ☎️ telephone
    🔋 battery
    🔌 plug
    📷 camera photo
    📸 camera flash
    🎥 movie camera video
    📺 tv
    🔍 search magnifying glass
    🔎 search magnifying right
    🔒 lock locked secure
    🔓 unlock open
    🔑 key
    🔨 hammer
    🛠️ tools fix
    🔧 wrench fix
    🪛 screwdriver
    ⚙️ gear settings
    🧪 test tube experiment
    🔬 microscope
    🧲 magnet
    🧹 broom clean
    🗑️ trash bin delete
    ⏰ alarm clock
    ⏳ hourglass waiting
    ⌛ hourglass done
    ⏱️ stopwatch timer
    🕐 clock time
    🧯 fire extinguisher
    🛒 cart shopping
    🎫 ticket
    🏷️ label tag
    🪄 magic wand
    🧸 teddy bear
    🕯️ candle
    🪴 potted plant
    🛋️ couch
    🛏️ bed sleep
    🚪 door
    🪞 mirror
    💎 gem diamond
    👑 crown king queen
    🎓 graduation cap
    🧳 luggage travel
    ☂️ umbrella
    🌂 closed umbrella
  `),
];

/**
 * Every emoji whose words hold what was typed. The one NAMED it comes first, so
 * "eyes" is 👀 before 😍; then a word that STARTS with it, so "ok" is 👌 before
 * it is the 📖 in "book".
 */
export function findEmoji(typed: string): [string, string][] {
  // Slack names are typed between colons, ":eyes:".
  const q = typed.trim().toLowerCase().replace(/^:+|:+$/g, '');
  if (!q) return [];
  const all = EMOJI_GROUPS.flatMap((group) => group.emoji);
  const named = all.filter(([, words]) => words.split(' ')[0] === q);
  const starts = all.filter((entry) => !named.includes(entry) && entry[1].split(' ').some((word) => word.startsWith(q)));
  const inside = all.filter((entry) => !named.includes(entry) && !starts.includes(entry) && entry[1].includes(q));
  return [...named, ...starts, ...inside];
}
