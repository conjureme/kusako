<div align="center">
  <!-- <img src="https://github.com/user-attachments/assets/db6fb2fc-f917-4bd5-801f-7a8994ac22a0" alt="kusako logo" width="200"> -->
  <h1>kusako</h1>
  <p><strong>highly customizable frontend to bring your own characters and models to create interactive characters that can speak, play games, and stream!</strong></p>
  <p>
    <img src="https://img.shields.io/badge/Turborepo-110f12?style=flat&logo=turborepo" alt="Turborepo Badge">
    <img src="https://img.shields.io/badge/TypeScript-5.0%2B-d5f9ff?style=flat&labelColor=110f12&logo=typescript" alt="TypeScript Badge">
    <img src="https://img.shields.io/badge/license-MIT-d5f9ff?style=flat&labelColor=110f12&" alt="License Badge">
  </p>
  <p>
    <a href="https://discord.gg/rn9j69ApJQ"><img src="https://img.shields.io/discord/1310128789887389716?logo=discord&logoColor=white&color=5865F2&labelColor=110f12" alt="Discord"></a>
  </p>
</div>

> [!NOTE]
>
> kusako is still very early in development. the [discord module](https://github.com/conjureme/kusako-discord) is the most mature, while this monorepo is actively being built.

kusako is a monorepo (and character) for creating interactive AI characters that can use audio, chat on discord, stream on twitch, and more. it's essentially a self-hosted alternative to [character.ai](https://character.ai/) or xAI's "[Companions](<https://en.wikipedia.org/wiki/Grok_(chatbot)#Grok_4>)", but you get to choose your own models, your own providers, and your own settings.

while there are a lot of great platforms to interact with text generation LLMs, like the goat [SillyTavern](https://github.com/SillyTavern/SillyTavern), kusako aims to take interactivity to the next level by adding voice, custom 2D avatars, the ability to play games or join discord calls, and more, all while staying true to the local-first ideology.

### sako's vision

1. ALWAYS local-first. your data stays on your device through your browser. there are no accounts, no cloud storage, and no subscriptions. chat history, character cards, avatar models, API keys, etc. are all stored in your browser or on your device.
2. "bring your own everything." kusako won't lock you into any provider, model, or service. you can choose to use local inference through a provider like [KoboldCPP](https://github.com/KoboldAI/KoboldCpp), connect to OpenRouter, or use beefy LLMs like [Claude](https://claude.ai).
3. kusako and everything it entails is a passion project, it's free and open source, and always will be!

## roadmap

### `@kusako/web`

- [x] settings/config
  - [x] providers configuration
  - [x] text completion settings
  - [x] template create/save/load/delete
    - [x] SillyTavern compatibility
  - [ ] additional provider support
- [ ] chat interface
  - [ ] character cards
  - [ ] lorebooks
- [ ] character stage
  - [ ] Live2D avatar display
  - [ ] idle animations
  - [ ] streaming mode

### `@kusako/discord`

- [ ] full module integration
  - [ ] API support
  - [ ] function calling (send DMs, update status, join voice, etc.)
  - [ ] autoresponders
  - [ ] economy system and minigames
  - [ ] voice channel support

### avatar/model support

- [ ] Live2D model loading and rendering
- [ ] VRM model support
- [ ] model storage

### audio

- [ ] TTS integration
- [ ] STT input
- [ ] voice conversion
