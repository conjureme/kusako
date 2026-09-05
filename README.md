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

kusako is a discord bot for servers that want an economy, leveling, items, a shop, and autoresponders that fire when people say things, join, level up, or click a button. she's written in typescript on [discord.js](https://discord.js.org/) and keeps everything in one sqlite file, so you don't gotta host anything besides her !

sako's replies also DO things. you can have an autoresponder that pays someone on a level up, takes an item away, or gives roles when people join or press a button.

## a few examples

a timed autoresponder reminder for a discord bot minigame. this adds a reaction to the triggering message; then, 480 seconds later, sends the reply:

```
{user.nickname as guy}{react:<a:15:1452348277591900343>}{cooldown:480}{delay:480}{user}, your drop is off cooldown !! {error:you're still on cooldown... please wait a bit [guy]~ <:catRose:1338734225993633843> }
```

a join event, written just like an autoresponder. fires when someone joins your server:

```
{addrole:1346588187472039956}{addrole:1346588712091521145}{addrole:1346588148519534683}{addrole:1385742887328677969}{embed:welcome1}{reactreply:<a:wavey:1541205650594468050>}
```

a boost event:

```
{modifybal:5000}{embed:boosted}
```

a `.crime` currency command. this has a 1 hour cooldown, gives either a large amount (400-550), regular amount (50-200), or nothing at all. the flavor text, or 'crime' being committed is randomly chosen:

```
{server.currencyemoji as c}{cooldown:3600}{error: can't commit another crime yet! wait for [cooldown.remaining]}{range as jackpot: 400-550}{range as gain: 50-200}{choice as crime: fed kusako beyond salmon instead of a real fish | called kusako a giga dent | gifted sako a chicken biryani scented candle | mega lowballed a sofi bot card }{weightedchoice as roll: 10 big | 40 win | 50 caught}{lockedchoice as del: roll | [jackpot] | [gain] | 0}{lockedchoice as outcome: roll | somehow made bank off it,,, [c] **[jackpot]** | got away with it,, [c] **[gain]** | got caught instantly,,, nothing for you}{modifybal:[del]}you [crime] and [outcome]
```

## note on autoresponders and "replies"

a reply is plain text with tags in braces. there are four types of tags:

- **placeholders** fill in: `{user}`, `{server.membercount}`, `{user.balance}`
- **generators** generate something and remember it: `{range as prize: 30-60}`, then `[prize]` anywhere after
- **guards** decide whether it fires at all: `{requirebal:100}`, `{requirerole:admin}`, `{cooldown:3600}`
- **effects** change things: `{modifybal:-100}`, `{addrole:verified}`, `{temprole:muted|600}`

small note: if any guard fails, nothing happens and she'll say why. if they all pass, every effect commits together. there is no half-fired reply.

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
