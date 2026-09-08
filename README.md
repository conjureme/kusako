<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/stinkmage/assets@main/kusako-banner-transparent.png" width="680" alt="kusako" />
</p>

<p align="center">a discord bot for economy, levels, items, and custom autoresponder replies.</p>

<p align="center">
  <a href="#"><img src="https://img.shields.io/badge/invite%20her-soon-c9b8ec?style=flat&labelColor=8f79c9" alt="invite her" /></a>
  <a href="https://discord.gg/ytsuErErG5"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fdiscord.com%2Fapi%2Finvites%2FytsuErErG5%3Fwith_counts%3Dtrue&query=%24.approximate_member_count&suffix=%20members&logo=discord&logoColor=white&label=support%20server&labelColor=8f79c9&color=c9b8ec" alt="support server" /></a>
  <a href="#"><img src="https://img.shields.io/badge/docs-soon-c9b8ec?style=flat&labelColor=8f79c9" alt="docs" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/stinkmage/kusako?style=flat&labelColor=8f79c9&color=c9b8ec" alt="license" /></a>
</p>

kusako is chunky discord bot full of features fit for your community servers! she can handle economy, level roles, custom usable items, server shops, and has a super extensible autoresponder system. sako is written in typescript on [discord.js](https://discord.js.org/) and keeps everything in one sqlite file, so you don't gotta host anything besides her !

## overview of sako's features

<table>
<tr>
<td width="50%" valign="top">

### autoresponders !

- matchmodes: exact, starts with, ends with, or includes for triggers
- message args: words around a trigger become variables
- guards, effects, and generators: restrict autoresponders, pay out currency or roles, and handle randomness
- reply shapes: react, DM, send a reply to a different channel, or split it into multiple messages

### economy !

- currency: per-server name & emoji
- items: per-server catalog, each with an optional reply powered by sako's DSL when using an item
- inventories: server members hold items and gift them to one another
- shop: listings with a price, optional stock, and role requirements
- global currency: a separate user-scoped balance used globally across servers

### leveling !

- XP per message: 1-10 per message, once per minute
- level up replies: optional per level, powered by the DSL

### events !

- join and leave: sends a reply in a channel, written with same tags
- boost: fires when someone boosts
- fully templated: an event reply can give roles, attach a saved embed, or react to itself

### scheduling !

- posts: daily, weekly, every N minutes, or once at a time
- timezones: can be set per server
- temp roles: `{temprole}` gives a role and takes it later
- self-deleting replies: `{delete_reply}` deletes sako's reply after a few seconds

</td>

<td width="50%" valign="top">

### tickets !

- ticket channels: customizable panel of buttons, and a click opens a private channel
- ticket types: create as many ticket types as you want, each with its own visible roles, greeting, and cooldowns
- close and reopen: closing locks the channel and automatically archives it, staff or opener can reopen

### embeds !

- saved embeds: create one, name it, then send it using `{embed:name}` in a reply
- live builder: buttons and modals in discord, with a live preview
- JSON import: paste from any embed builder site

### minigames & gambling !

- `/pat`: give sako headpats for server currency tips
- more coming: coinflip, roulette, blackjack, ride the bus
- fully configurable: disable gambling games, configure min & max bets, and change cooldowns

### in the works !

- giveaways
- stickies
- auto-threads
- `/leaderboard`
- birthdays

</td>
</tr>
</table>

## a few DSL examples

a timed autoresponder reminder for a discord bot minigame. this adds a reaction to the triggering message; then, 480 seconds later, sends the reply:

```
{user.nickname as guy}{react:<a:15:1452348277591900343>}{cooldown:480}{delay:480}{user}, your drop is off cooldown !! {error:you're still on cooldown... please wait a bit [guy]~ <:catRose:1338734225993633843> }
```

a join event, written just like an autoresponder. fires when someone joins your server:

```
{addrole:1346588187472039956}{addrole:1346588712091521145}{addrole:1346588148519534683}{addrole:1385742887328677969}{embed:welcome1}{reactreply:<a:wavey:1541205650594468050>}
```

a boost event, sends an embed and gives the booster 5,000 currency:

```
{modifybal:5000}{embed:boosted}
```

a `.crime` currency command. this has a 1 hour cooldown, gives either a large amount (400-550), regular amount (50-200), or nothing at all. the flavor text, or 'crime' being committed is randomly chosen:

```
{server.currencyemoji as c}{cooldown:3600}{error: can't commit another crime yet! wait for [cooldown.remaining]}{range as jackpot: 400-550}{range as gain: 50-200}{choice as crime: fed kusako beyond salmon instead of a real fish | called kusako a giga dent | gifted sako a chicken biryani scented candle | mega lowballed a sofi bot card }{weightedchoice as roll: 10 big | 40 win | 50 caught}{lockedchoice as del: roll | [jackpot] | [gain] | 0}{lockedchoice as outcome: roll | somehow made bank off it,,, [c] **[jackpot]** | got away with it,, [c] **[gain]** | got caught instantly,,, nothing for you}{modifybal:[del]}you [crime] and [outcome]
```

## autoresponders and "replies"

a reply is just plain text that can use tags in braces. there are four types of tags that can be used across kusako's features:

- **placeholders** fill in: `{user}`, `{server.membercount}`, `{user.balance}`
- **generators** generate something and remember it: `{range as prize: 30-60}`, then `[prize]` anywhere after
- **guards** decide whether it fires at all: `{requirebal:100}`, `{requirerole:admin}`, `{cooldown:3600}`
- **effects** change things: `{modifybal:-100}`, `{addrole:verified}`, `{temprole:muted|600}`

if any guard fails, nothing happens and she'll say why. if they all pass, every effect commits together!

any typos in placeholders will render as raw text, like `{addrol:}`, instead of disappearing. kusako will also reject things that can't work upon saving instead of misfiring !

a full list of placeholders and examples can be found here: TODO

## development

> [!NOTE]
> sako isn't hosted publicly yet. until she is, this is how you get her.

make an application in the [discord developer portal](https://discord.com/developers/applications), add a bot to it, and turn on the **server members** and **message content** intents. then:

```sh
pnpm i
```

create a `.env` in the repo's root:

```
BOT_TOKEN=
CLIENT_ID=
GUILD_ID=
DB_PATH=
OWNER_ID=
```

`BOT_TOKEN` and `CLIENT_ID` are required. `GUILD_ID` is the server to register commands to while developing, but isn't required. `DB_PATH` defaults to `data/sako.db`. `OWNER_ID` unlocks the owner-only `;global` and `;status` text commands!

```sh
pnpm register
pnpm dev
```

`register` pushes the slash commands to your `GUILD_ID` server, and you'll need to run it again whenever you add or update commands, e.g., adding a subcommand. `pnpm register:global` pushes them globally.

> [!NOTE]
> sako's home is the **[cardboard atelier](https://discord.gg/ytsuErErG5)**, an art and social server that doubles as her support hub. the server utilizes her features extensively, so feel free to join and look around for inspiration or get help!
>
> https://discord.gg/ytsuErErG5

## thank you to

- [mimu](https://mimu.bot/): kusako's autoresponder and economy were heavily inspired by mimu! if you're looking for an even more adorable and powerful bot for your community, you should totally check [iara's](https://x.com/iaramallows) bot out at https://mimu.bot/ !
- [Glitchii](https://github.com/Glitchii): for the incredible [embed builder](https://glitchii.github.io/embedbuilder/) i used NUMEROUS times throughout building this project and others.
- [SOFI](https://sofi.gg/): an anime card collecting bot whose drop timers are why `{delay}`, `{cooldown}`, and a few other DSL features exist !
