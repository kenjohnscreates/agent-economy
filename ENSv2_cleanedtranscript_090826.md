# ENS: ENSv2 — Identity for Apps, Agents & Beyond
**Speaker:** Kevin Krone (technical writer, ENS Labs) · **Event:** ETHOnline 2026 workshop (ETHGlobal)
**Streamed:** Sep 4, 2026 · **Duration:** ~27:30 · **Source:** youtube.com/watch?v=CTpZBTFtiow

> Cleaned from YouTube's auto-generated captions: filler removed, punctuation and paragraphs added, and obvious speech-to-text errors corrected against context (e.g. "Sepolia" for "Sapodia/Solia", "USDC" for "UCCC", "Etherscan" for "Ephoscan", "NameWrapper" for "nameweber", "ERC-8004" for "804", "Enhanced Access Control" for "ec/al system", "wildcard resolution" for "white card"). Corrections are best-effort interpretations of a rough auto-transcript; verify technical specifics against the ENS docs before relying on them.

---

**Host:** Welcome everybody to our ENS workshop today with Kevin. If you have any questions, please write them in the chat and we can address them toward the end of the presentation. I might mute some of you — I can see AI note-takers on the call, and they get a little crazy. If you're here and not an AI, please stay muted through the presentation, and at the very end Kevin will take some questions. Other than that, Kevin, the floor is yours.

**Kevin:** Thank you. Hello everyone. My name is Kevin Krone and I'm a technical writer on the dev team at ENS Labs. Today I'm going to give a short workshop — no coding, just walking through some slides — specifically highlighting the ENSv2 beta deployment on Sepolia.

Let me say up front: we deployed a separate set of contracts to Sepolia specifically for the hackathon, so please make sure you deploy against those. If you go to docs.ens.domains, there's a banner at the top that takes you to a feature branch listing the deployments and telling you how to point your VM/EAS code at these contracts. I'll also post this in the Discord channel and the ENS developer Telegram group, just as a heads-up.

Let's walk through a few slides. I'll give a brief introduction to ENS in general, then talk more about ENSv2 and what you can build with it.

## What is ENS?

ENS, the Ethereum Name Service, is a decentralized naming protocol that lives on Ethereum. It started by turning complex hex addresses into human-readable names. Nobody can actually remember a raw address, but it's easy to say "send 5 USDC to work." So we think of ENS as a user-experience protocol on Ethereum.

But that's just how it started. Over time ENS grew into an on-chain profile. On my personal ENS profile in the manager app, I have my X handle, my GitHub handle, and addresses across different chains. It's multi-chain — you can store a base address, a Bitcoin address, a Solana address, and so on, so people can reach you if they know your ENS name. There's also an avatar, plus text and data records you can use to build interesting applications, all contained under one name.

One of the most basic ENS applications: when you connect to a dApp, instead of just showing your raw Ethereum address (not a personable experience), it can display your name. For that you need not only forward resolution (name → address) but reverse resolution, because the app knows your address but not the associated name. Apps like snapshot.org and match.xyz integrate this today, and there are many more. Etherscan is another example — I showed a quick demo of what activity looks like without ENS (random unreadable addresses and contracts) versus with ENS (you can see there's a user and a contract involved). It's a much better user experience.

The general idea: users of crypto-powered experiences should never have to interact with a hex address. Anywhere you'd read or write a hex address, you should be able to use an ENS name instead.

## How resolution works

The two core processes in the ENS contracts are forward and reverse resolution.

- **Forward resolution:** start from an ENS name (say, nick.eth) and resolve it to an address — an Ethereum address, a base address, something on Optimism mainnet, etc. (On my slide I forgot to change the addresses; they're all EVM served by the same key, but you can store different addresses per chain if you want.)
- **Reverse resolution:** used when you connect to an app that only knows your wallet address — you can point that address back to an ENS name by configuring a reverse record.

When you have both — the name pointing to an address and that same address pointing back to the name — you have a loop, and that's what we call a **primary name**.

## What's new in ENSv2

A few weeks back we finally deployed the ENSv2 beta contracts on Sepolia, and people have been playing with them. Because there are still some changes coming, we wanted a stable environment for the hackathon, so we deployed a separate, frozen set of contracts that won't change for the hackathon's duration — whereas the main Sepolia deployment might change with fixes before mainnet.

**Flat registry → hierarchical registries.** ENSv1 had one flat registry structure. The whole tree of names and subnames (e.g. `sub.alice.eth`, like DNS subdomains) was encoded in a single flat registry using the namehash algorithm — a nice, efficient approach at release time. But ENS grew, people wanted more features, and path names became more interesting. ENSv2 is a full redesign incorporating almost 10 years of lessons, where the hierarchy is actually visible in the smart contracts: there's a root registry, then an `.eth` registry, then Alice has her own registry, and so on — a genuinely nested structure.

**Deploy-your-own-resolver by default.** In ENSv1 most people used the shared public resolver by default; a custom resolver was optional. In ENSv2 the default is that you deploy your own resolver, implemented as a shared proxy (one implementation, you just deploy a proxy) via a dedicated factory contract. You can also deploy your own subregistry — there's a clean separation between registries, resolvers, and subregistries — again via a factory, though you may not need it depending on your use case.

If you want subnames that are tokenized, or subnames with different permissions, you'd deploy a subname registry. Alternatively you can take a resolver and do **wildcard resolution** — storing records for certain names in the resolver without tokenizing them, just to hold data for those subnames.

**A typical setup** (there's also a guide in our docs): for example, nick.eth deploys his own subregistry, and on top of that a **registrar** contract — so you'd have a resolver, a subname registry, and a registrar. The registrar configures how people obtain a name in your subregistry: the slide says "5 USDC per year," but you can be creative — maybe they need to own a specific NFT, or do something else, to claim a subname.

You can also configure subnames with permissions: grant them the right to deploy their own resolver or subregistry; make subnames non-transferable; or create "forever names" where the parent has a very long expiry and drops all permissions to interfere with the subnames, so those subnames are effectively emancipated below the subregistry. Lots of room to explore.

**Mutable token IDs + Enhanced Access Control (EAC).** ENSv2 has mutable token IDs, tied to a new role-based permission system called Enhanced Access Control. You typically have a role and an admin role, and can grant specific permissions (set your own resolver, create your own subregistry, etc.). Consider selling a name: it would be bad if a set of permissions came with a token, transferred to the buyer, and then the seller changed the permission set afterward to scam them. So whenever a permission is granted or revoked on a token, the token is burned and re-minted to the same owner — meaning the **token ID changes**. Something to account for in your projects. Transferring or renewing a name doesn't change the token ID; but edge cases like a name expiring or being re-registered do. All of this is in the V2 docs.

## Why get into ENSv2

If you hack with it a bit, you'll find ENSv2 is more flexible and cleaner in design than ENSv1 and, for example, the NameWrapper. ENS accumulated many features over time as people found new uses, but a lot of those applications weren't obvious at the start. ENSv2 is a full redesign of the infrastructure with those lessons baked in, so it gives you much more flexibility and room to be creative.

The Enhanced Access Control permission system even lets you grant someone the right to change a single text record, or just the avatar, for a name — far more granular than before.

**Aliasing** (two features):
1. **Record-level aliasing (shared records):** point two names at the same set of text/address records. They resolve identically, and changing a record (e.g. an address) changes it for both.
2. **Registry-level aliasing:** point two ENS names at the same subregistry. If alice.eth and bob.eth both point to a subregistry containing a token labeled `abc`, then after aliasing, both `abc.alice.eth` and `abc.bob.eth` resolve. So you can alias whole namespaces — a very interesting capability.

## Building with ENS

**AI agents as namespaces.** Even in ENSv1, AI agents have been popular at recent hackathons. I like to think of agents as namespaces: you might have `agent.<yourname>.eth`, then go one level lower with versions like `v1` and `v2` of the same on-chain agent, with the parent name pointing to the latest version. You can use data/text records to store information about the agents in your ENS name.

One example is **ENSIP-255**, which lets you create a two-way loop with an ERC-8004 agent registration: point at the registry, give the agent ID, and verify it — if an ERC-8004 agent carries an ENS name in its registration file, you can point back from your ENS name to consent to that agent using your name. There's also **ENSIP-26**, where you store an endpoint for an agent in a text record/context (e.g. an agent-to-agent endpoint). These are agreed-upon standards, but you're free to define your own.

**Other application ideas:**
- Usernames / text subnames.
- **Wallets** — I think it makes sense to integrate ENS into wallets by default; it improves UX a lot.
- **Social apps** — very popular; you can even use ENS names as a lightweight decentralized database and show them as usernames.
- **Content** — there's a "content hash," a piece of data you attach to a name; combined with IPFS you can host a decentralized website behind your ENS name.

Generally: anywhere a hex address shows up, an ENS name should show instead.

## Hackathon prizes

Two tracks. Main focus is **best use of ENSv2** — we're keen to see how creative you get.
- Runner-up: $500
- Third place: $1,000
- First and second: $1,500 each

**Continuity track:** $500. For this one, use the regular Sepolia deployment (not the frozen hackathon deployment). The idea is to integrate ENSv2 into an app that already exists, in a sensible way, making it ready for the ENSv2 mainnet deployment.

That's the end of my presentation. Happy to take questions — you can also add me on Telegram, and there's an ENS developer group you can find in the docs.

## Q&A

**Q (chat): Can a subregistry or subname be under a subregistry (nested subnamespaces)?**
Kevin: Yes, as long as the permissions have been granted to the parent subregistry. You can nest to effectively infinite depth.

**Q (chat): Is there a way to use ENS to host a website front end?**
Kevin: I'm not an expert on this. If you want to store the front end fully on-chain, you'd need to figure out how to compress it sensibly. There has been work on this topic — I'm not up to date on the latest — but it's a very interesting application, and a nice thing to explore during the hackathon.

*(Host notes the ENS developer Telegram QR code is on screen.)*

**Q (Javier): For my hackathon game, if each player has a profile, should every user be something like `javier.mygame.eth` (users connect beneath my game's name), or should users own their own account and add the game part themselves?**
Kevin: You're basically asking about subnames. The most straightforward approach is to have `mygame.eth` (or `javier.eth`) and make every user a subname of it, e.g. `kevin.mygame.eth`. Since it's a game, you can use text/data records on those subnames to store game info — items and so on.

**Q (chat): Can they use Arc with ENS?**
Kevin: Not sure — it depends on what they want to do with Arc. For storing addresses, since resolution always uses L1 mainnet, you can store whatever you want; you just read it from mainnet. Whether Arc specifically works depends on the exact use case. For more, ask in the Discord.

**Q (Mauricio, Cochabamba, Bolivia): We want to build an interoperable loyalty and gamification engine based on "gift tokens" — rewards, coupons, points, miles that companies give customers — plus a shared loyalty crypto (we call it "Nexa"). Companies have wallets, each campaign has a budget wallet, and customers have wallets holding gift tokens and the crypto. Can we use ENS's wallet-naming features for this?**
Kevin: If I understand correctly, the obvious ENS application is using subnames for the protocol's users — instead of working with raw addresses, issue subnames to them.
Mauricio: Yes, it'd be nice for these brands' customers to have a named, personalized wallet. What about the paymaster — do we solve that separately, or does ENS provide a paymaster/gas solution?
Kevin: That's something you solve separately; it's a different layer of the stack. ENS is just a resolution/discoverability layer that translates addresses into names.
Mauricio: Great, we really like this feature — we'll figure out how to build personalized wallets for these clients.

**Host:** That's all the time we have for this workshop. The Telegram is on screen — scan the code — and our developers like Kevin will be available in the Discord throughout the hackathon. Thanks for your time; drop questions in Discord, and we'll see you at the kickoff. Thank you, Kevin.
**Kevin:** Thank you very much for having me. Bye-bye.
