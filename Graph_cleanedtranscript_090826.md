# Building on The Graph with AI — Kevin Jones (ETHOnline 2026)

- Source: https://www.youtube.com/watch?v=9Hjn04T5qPI
- Channel: ETHGlobal
- Captions: auto-generated (cleaned version corrects obvious speech-to-text and Web3-term errors)

---

## Cleaned transcript

What's up guys, Kevin Jones here. Today we're going to be talking about The Graph protocol. This is going to be a speedrun, but very informative if you're going to be building on The Graph for ETHOnline. This is the first hackathon I ever participated in with ETHGlobal, and I'm glad to teach you and help you out a little bit.

If you need data inside your web app, your AI agent, or whatever you're working on, and you need access to blockchain data, The Graph can solve a lot of problems when it comes to getting that data in a reliable and queryable way. Let's start sharing the screen and talk about The Graph.

First of all, what is The Graph? The Graph is a decentralized network of indexers that provide a level of service to query and access otherwise difficult data that you would normally need an RPC or your own node to get. With The Graph, you can just subscribe to the service you need to query that data.

There are a few different products available. One is subgraphs, which let you query data via GraphQL. All the data is indexed and stored inside a database, then translated for you via subgraph processing and exposed over GraphQL.

There's also a Graph Explorer, which lets you find subgraphs that already exist. If you're looking for something like Uniswap, ENS, or whatever it is, you can search for what you need — they're roughly ordered by the most popular subgraphs.

You can go to the Studio if you want to create your own subgraph. If you're writing your own smart contract, you'll probably need to write your own subgraph. The benefit is you can customize it however you want. You come in, click "create a subgraph," name it, and click create. It walks you through all the steps: choose the chain, install the CLI, run `graph`, and it asks for the contract address, which blocks you care about, and whether you want to index all the events — a wizard-like, choose-your-own-adventure experience. Then it scaffolds that out for you. You authenticate against the Studio with the `auth` command, go into the directory where the subgraph is generated, generate the code, build it, make sure it builds properly, and deploy it. If you make changes later — say you add a new function to your smart contract and need a new entity — you can regenerate all those types, customize them, make sure it builds, and deploy again. So you'll use the Studio mostly for creating your own subgraphs.

The other technology is substreams. If you're going to get access to more than just events, substreams are super powerful and a lot faster. You can stream data over a parallelizable interface, choose exactly which blocks you want to stream, and then put those into a database in any structure that makes sense — ClickHouse, a CSV file, MySQL, whatever you decide. These are all written in Rust, and there are existing packages already available at substreams.dev. If you want an API key, you go to thegraph.market.

Subgraphs versus substreams really just depends on what you want to build — it's up to you.

Then, in the docs, I want to highlight two things. One is the AI tooling section. We have a subgraph MCP server, which is great. It's written so you can discover and find the subgraph data you care about — the format, the structure, the schema — dynamically via MCP. It's really useful if you're building AI agents, and really useful if you're using your IDE on your machine, like Claude Code, Cursor, whatever. We also have skill files here — the subgraph skill file and a substreams skill file. If you're going to build a subgraph, point your AI here; same for a substream.

Again, substreams are very fast and parallelizable. The graph.market has its own API key, so if you're going to do substreams you go there for your key. If you're going to use subgraphs, you go to the Subgraph Studio for your API key.

Let's talk about prizes. We have $15,000 in prizes. The first category is best use of a composable or standardized graph product — something like Messari subgraphs, or the agent-zero subgraph for ERC-8004, or maybe an ENS subgraph. Creating your own composable subgraph would also be interesting, or fixing existing Messari ones that aren't properly written.

We also have best AI tooling built with The Graph, or best AI use case. That could be AI developer tooling, or something that brings power to AI using The Graph network — infrastructure that runs on the network as a data service, new tooling, an improved MCP server, lots of things. The other one is just using The Graph for AI, but this needs to be more than a chatbot that queries The Graph — something more advanced and an interesting, outside-the-box use case. This is the from-scratch track, and there's an equivalent track if you're continuing an existing project.

Next, a quick demo of Scaffold Agent. Scaffold Agent is a starter kit, very similar to Scaffold-ETH if you've used that before. It's inspired by it, but more AI-friendly and agent-friendly, with a built-in chat interface. You don't need to use it — you can just use the skill file and follow the normal subgraph flow — but I want to show it off because it's useful.

We go to scaffoldagent.xyz, copy the command, run it, and call it "the-graph." It asks how we want to store our secrets. For those who don't know, I'm also the founder of OneClaw, a secrets-management and AI-agent infrastructure tool. We're going to use that. You don't need to — you can use a basic `.env` file, encrypted on your local machine, or unencrypted if you just want to YOLO it for testnet. But one thing I'm focused on is making production-grade applications for AI, so we'll use OneClaw, and I'll show you why.

We log in to OneClaw, go down to Settings, then API keys. We revoke this key, create a new one called "the graph," copy it, and paste it in. We need to encrypt that one key because we'll have a key sitting on disk.

Now it asks: do we want to generate a signing key — basically an Ethereum address — to do the deployment? Yes. Do we want to use Amp? No. Do we want to get subgraph data from The Graph? We can say MCP, or use x402 to pay for data. That's another thing I didn't mention — you can pay for your queries over x402 using micropayments. We'll configure both.

It asks which LLM provider we want. OneClaw has an LLM proxy that helps make sure you don't get prompt injection or malicious code execution — it can do some inspection — so I'm going to choose that. It asks what provider: I'll choose Google. Then whether we want our own billing or to provide an API key: I'll provide an API key, grab my Gemini API key, and paste it in. It asks what chain to use — we'll choose Foundry — and what front end — I'll choose Next.js. The last question is whether to force signing inside the trusted execution environment. We'll use that; you can also choose to sign locally. We generate the Ethereum key and it bootstraps the application.

What it just did is create a monorepo with a chain and a front end. It created a private key for the actual deployment of your smart contract and for the AI agent itself, and stores those in the vault, server-side, inside a hardware security module. When the agent signs, that happens inside a trusted execution environment, so the signing key never leaves physical hardware. The benefit is that if the agent gets prompt-injected and tries to steal the API key or private key, it can't, because it's not there.

We let that install and look at OneClaw: we have a vault — "the graph" vault — and "the graph" agent. In the vault we have the Google account and the two agents. We run `npm run quickstart`, which spins up the chain, the front end, everything we need. We put in the password for the vault we created earlier, twice, because both the front end and the chain pull from the vault to programmatically grab and use the secret.

Now we go to localhost:3000 and ask a simple question like "what is your address" or "what is your balance" — or "check my wallet balance." There we go. This gives you a very basic AI agent that's ready to query The Graph, either via MCP or using x402. It's pre-programmed and set up. There's a data tab where you can find subgraphs and get assistance on how to query data. For the most part, everything works.

I hope you found that useful. Good luck building on The Graph — build something awesome, and let me know if you have any issues or questions. You can reach out to me on X: I'm @devsecopz (D-E-V-S-E-C-O-P-Z). Hopefully you don't run into any issues and you build something cool. Catch you next time.

---

## Raw transcript (auto-generated, with timestamps)

```
00:00:10 What's up guys? Kevin Jones here. Today
00:00:12 we're going to be talking about the
00:00:14 graph protocol. This is going to be a
00:00:16 speedrun but very informative if you're
00:00:18 going to be building on the graph for
00:00:20 ETH online. So very excited. This is the
00:00:22 first hackathon I ever participated in
00:00:24 with uh ETH global and I'm very excited
00:00:27 to teach you guys and help you out a
00:00:29 little bit. So if you need data inside
00:00:31 of your uh web app or your AI agent or
00:00:35 inside of whatever you're working on and
00:00:37 you need access to blockchain data, uh
00:00:39 the graph is going to be able to help
00:00:41 solve uh a lot of problems for you when
00:00:43 it comes to getting that data in a very
00:00:45 reliable and queryable way. So uh let's
00:00:48 go ahead and start sharing our screen
00:00:51 and let's go ahead and talk a little bit
00:00:54 about the graph. So first of all, what
00:00:57 is the graph? The graph is a
00:00:58 decentralized network of indexers that
00:01:02 provide a level of service to query and
00:01:06 uh get access to otherwise difficult
00:01:09 data that you would need to use
00:01:11 something like a RPC
00:01:14 um or run your own node with the graph.
00:01:17 You can just prescribe or subscribe to
00:01:19 the service that you need to be able to
00:01:21 query that data. So there's a few
00:01:23 different products that are available.
00:01:25 One is called subgraphs which allow you
00:01:28 to query data via GraphQL. All of the
00:01:31 data is indexed and stored inside of a
00:01:34 database and then translated for you uh
00:01:37 via via uh some cool subgraph um uh
00:01:42 processing and exposed via GraphQL.
00:01:46 We also have a graph explorer which lets
00:01:48 you find existing subgraphs that already
00:01:50 exist. So if you're looking for let's
00:01:52 say unis swap or ens or whatever it is,
00:01:56 you can come here and search for
00:01:58 whatever you need, right? Uh they're
00:02:00 kind of ordered by the most popular of
00:02:01 the subgraphs. Um you can go to the
00:02:04 studio if you want to create your own
00:02:06 subgraph. So if you are writing your own
00:02:10 um smart contract, you're probably going
00:02:12 to need to write your own subgraph. Um
00:02:14 and the the benefit to that is that you
00:02:17 can customize it and make it however you
00:02:19 want. Um, all you need to do is come in
00:02:21 here, say create a subgraph, name it
00:02:23 whatever you want,
00:02:25 click create. It's going to walk you
00:02:28 through exactly all the steps you need
00:02:29 to do. So you choose the chain, you
00:02:32 install the CLI,
00:02:35 you run graph and it's going to ask you
00:02:37 for the contract address, what blocks
00:02:40 you care about, whether you want to
00:02:42 index all the events, these like kind of
00:02:45 wizard like um choose your own adventure
00:02:48 type of uh experience. Then it's going
00:02:50 to scaffold that out for you. Then you
00:02:52 can actually take it and authenticate
00:02:54 against the studio with the off command.
00:02:58 go into that directory where that that
00:03:00 subgraph is generated, generate all the
00:03:03 code, build it out, make sure it builds
00:03:05 properly, and then deploy it. So if you
00:03:07 want to make changes, you know, let's
00:03:10 say you add a new function to your uh
00:03:12 smart contract and you need to create a
00:03:15 new um entity, you can uh regenerate all
00:03:19 those uh types and do whatever you want
00:03:21 with them. Custom, make sure it builds
00:03:23 and then deploy it. So you'll use the
00:03:25 studio for pretty much um creating your
00:03:28 own subgraphs.
00:03:30 The other technology is substreams. Now
00:03:33 if you're going to try to get access to
00:03:34 more things than just uh events,
00:03:37 substreams are going to be super
00:03:39 powerful. Substreams are also a lot
00:03:40 faster. So you can stream data uh over a
00:03:45 parallelizable
00:03:47 interface. So you can take data um kind
00:03:51 of choose exactly what blocks you want
00:03:53 to stream uh you can then put those into
00:03:56 a database in any kind of structure that
00:03:58 you feel uh it makes sense right so
00:04:00 let's say you want to put it into click
00:04:02 house right or you want to put it into a
00:04:04 CSV file or my SQL or whatever it is
00:04:06 that you decide that you want to do you
00:04:08 can customize it these are all written
00:04:10 in Rust um and there are some existing
00:04:13 packages that are already available if
00:04:15 you go to the upstreams dev of uh if you
00:04:17 want to get an API key then you go to
00:04:19 the graph.market and that's available
00:04:21 here. So subgraphs versus substreams
00:04:24 it's really just depends on what you
00:04:25 want to build. Um it's really up to you.
00:04:28 Okay, we're not going to talk about AMP.
00:04:30 Um and then we'll go to the docs real
00:04:33 quick. I want to talk about two things
00:04:35 real quick. One is there's AI tooling
00:04:37 section. We have a subgraph MCP server
00:04:41 which is really great. Um it's basically
00:04:44 written in a way where you can discover
00:04:47 and find the subgraph data that you care
00:04:50 about and the format and the structure
00:04:52 the schema dynamically you know v via
00:04:56 MCP. It's really really useful uh if
00:04:59 you're building AI agents uh really
00:05:01 really useful if you're using like your
00:05:02 IDE uh on your machine like cloud code
00:05:06 you know cursor whatever it is.
00:05:09 Um, and then we have all of the um,
00:05:12 skill files as well here. So the subs
00:05:14 subgraph skill file is here. So if
00:05:17 you're going to build a subgraph, point
00:05:18 your AI here. If you're building a
00:05:20 substream, then we have that as well.
00:05:23 Okay, so it really just depends on what
00:05:24 you're going to do. Um, like again,
00:05:26 substreams are very fast,
00:05:28 parallelizable. Um, yeah, you can kind
00:05:30 of decide. Um, the graph.market, it has
00:05:34 its own API key. Uh so if you're going
00:05:36 to do substreams, you got to go to the
00:05:37 graph.market to get your API key. If
00:05:39 you're going to use uh the graph uh
00:05:42 subgraphs, then you're going to want to
00:05:44 go to the subgraph studio and get your
00:05:46 API key there. Let's talk about uh the
00:05:51 prizes. So we have $15,000 in prizes. Uh
00:05:54 the first kind of category is the best
00:05:57 use of a composable or standardized
00:06:01 graph product. So that would be
00:06:03 something like misari subgraphs or let's
00:06:07 say the agent zero uh subgraph for
00:06:10 ERC804
00:06:12 maybe ens subgraph might might kind of
00:06:15 fit into that. Uh or if you're going to
00:06:18 create your own um composable subgraph
00:06:21 that would also be be very interesting
00:06:23 as well. Maybe you want to like fix um
00:06:26 some existing misari ones that are not
00:06:28 you know properly written or something
00:06:30 like that.
00:06:32 We also have best AI tooling uh built
00:06:35 with the graph or best AI use case. So
00:06:38 this would be like AI developer tooling
00:06:41 or something that could be something
00:06:43 that will bring some power to AI uh
00:06:47 using the graph network. Okay, so it
00:06:49 could be infrastructure that runs on the
00:06:51 graph network that is some kind of new
00:06:53 revitalized way of like you know serving
00:06:55 um maybe like as a data service or
00:06:57 something. could be some kind of new
00:06:59 tooling, maybe a better improved MCP
00:07:01 server, could be a lot of different
00:07:03 things, right? Um, and then the other
00:07:06 one would be just using the graph for
00:07:07 AI. So, this needs to be more than just
00:07:10 like a chatbot, you know, that just
00:07:12 queries the graph, but something more
00:07:14 advanced. Um, and a very very
00:07:16 interesting use case that kind of going
00:07:17 outside the box. This is from scratch.
00:07:20 And then we also have the same one for
00:07:22 if you're continuing. Okay, so it really
00:07:24 depends on what you're going to do.
00:07:26 Okay, the next thing we're going to talk
00:07:27 about, we're just going to do a real
00:07:28 quick demo of Scaffold Agent. Now,
00:07:31 Scaffold Agent is a starter kit. It's
00:07:33 very similar to Scaffold ETH if you used
00:07:35 Scaffold ETH before. Scaffold agent is
00:07:38 inspired by that and it's more AI
00:07:40 friendly, more agentfriendly, and it's
00:07:43 got a built-in chat interface. Um, that
00:07:45 kind of stuff. So, we're going to use it
00:07:46 for our demo. You don't need to use this
00:07:48 um with just using the skill file and
00:07:51 following the normal kind of flow for
00:07:53 the subgraphs. can do it, but I want to
00:07:55 show this off because I think it's it's
00:07:57 quite useful. Uh, so we're going to
00:07:58 choose that. Um, we're going to scaffold
00:08:01 agent.xyz. We're going to copy this
00:08:03 command here and we're going to run it
00:08:05 here and we're going to call it
00:08:09 uh the graph. Okay. And it's going to
00:08:13 ask us how we want to store our secrets.
00:08:16 Now, uh, for some of you who don't know,
00:08:17 I'm also the founder of OneClaw, which
00:08:19 is a, um, secrets management and an AI
00:08:22 agent kind of infrastructure tool. We're
00:08:25 going to use that. You don't need to use
00:08:26 that. You can just do a basic ENV file
00:08:28 if you want encrypted on your local
00:08:30 machine or just unencrypted if you just
00:08:33 want to yolo it and just have the ENV
00:08:35 files. If it's just for like test net,
00:08:37 that's fine. But, you know, one of the
00:08:39 things I'm trying to focus on is like
00:08:41 making production grade applications for
00:08:43 AI. And so we want to just use one claw
00:08:46 for that. And I'm going to show you why.
00:08:48 We're going to log in here to one claw.
00:08:51 And we're going to go all the way down
00:08:52 to the bottom to settings.
00:08:57 And we're going to go to API keys.
00:09:00 And we're going to revoke this key. Do a
00:09:03 new key. We'll call it the graph.
00:09:06 Create it.
00:09:08 Copy the key. And we'll paste it in
00:09:11 here.
00:09:12 that. Now, we do need to encrypt that
00:09:15 one key because we need we're going to
00:09:17 have one like key that's sitting on
00:09:18 disk. So, let's do that.
00:09:24 Okay. Now, what we want to do is um do
00:09:26 we want to loc generate a signing key to
00:09:29 like basically an Ethereum address to do
00:09:33 the deployment? Yes, we're going to do
00:09:34 that. Uh do we want to use ampers? No.
00:09:38 Do we want to get subgraph data from the
00:09:42 graph? So, we can either say MCP or we
00:09:45 can do X42 to pay for data. That's
00:09:47 another thing I didn't mention, but you
00:09:48 can pay for uh your queries over X42
00:09:52 using microp payments. Um, but we're
00:09:54 going to use Yeah, sure. We'll we'll
00:09:55 configure both. Um, it asks us which LLM
00:09:59 provider we want to use. Now, one claw
00:10:01 has an LLM proxy that allows you to make
00:10:03 sure that you don't get prompt injection
00:10:06 uh or some kind of malicious code
00:10:07 execution. We can do some inspection.
00:10:09 So, I'm going to choose that just
00:10:11 because um yeah, it just makes sense. Uh
00:10:14 it asks us what provider we want to use.
00:10:16 I'm going to choose Google and whether
00:10:18 we want to do our own billing or provide
00:10:21 an API key. I'm going to provide an API
00:10:23 key and I'll enter it now. And I'm going
00:10:26 to go grab my Gemini API key here, which
00:10:29 is which one? I'll use this one.
00:10:34 Paste it in. And we're going to ask you
00:10:36 what it asks you what chain you want to
00:10:38 use. We'll choose Foundry and what front
00:10:40 end we want to use. And I'm going to
00:10:41 choose Nex.js. So you can see how it
00:10:42 kind of walks you through everything. Uh
00:10:44 the last one is for uh whether we want
00:10:46 to uh force signing inside of the
00:10:48 trusted execution environment. We're
00:10:50 going to use that as well. Yes. Um you
00:10:52 can choose to do signing locally if you
00:10:54 want as well. We're going to generate
00:10:55 the Ethereum key and now it's going to
00:10:58 bootstrap the application for us. Okay.
00:11:02 So, what it just did is it it created a
00:11:05 a mono repo with a chain with a front
00:11:08 end. It created a a private key for the
00:11:12 actual deployment of your smart contract
00:11:14 and for the AI agent itself. And it's
00:11:18 going to store those in the vault,
00:11:19 right? um those are going to be stored
00:11:21 server side inside of a hardware
00:11:23 security module and then when the agent
00:11:27 is signing that it actually happens
00:11:30 inside of a trusted execution
00:11:32 environment. So the signing key actually
00:11:34 never leaves um physical hardware and
00:11:37 the benefit to that is that the agent if
00:11:40 it gets prompt injected and it tries to
00:11:41 steal the API or the private key it
00:11:44 cannot uh because yeah it's not there.
00:11:47 Um, so we're going to let that install
00:11:51 and we'll go over here and look and see
00:11:52 what happens. So when we go to one claw,
00:11:55 we can see here that we got a vault. We
00:11:57 have the graph uh vault here and we have
00:12:00 the graph agent. So we look in the graph
00:12:01 vault, we have the uh Google account and
00:12:04 the two agents. Um we're going to run
00:12:07 npm
00:12:09 um
00:12:10 what is it? Help. Let's see what we can
00:12:12 do. Yeah, npm help. And that will give
00:12:14 us all the commands. Oh, sorry. Not uh
00:12:17 just help. Oh, that doesn't work either.
00:12:19 Uh just quick start. Let's do that. And
00:12:23 what this is going to do is spin up the
00:12:24 chain. It's going to spin up the front
00:12:27 end. It's going to spin up everything we
00:12:30 need. We need to put the password in for
00:12:32 the vault that we created earlier.
00:12:36 And twice because we need to load the um
00:12:40 front end. We also need to load the
00:12:41 chain. They both pull from the vault to
00:12:44 programmatically grab the secret and
00:12:46 store it or use it. And now we can go to
00:12:50 localhost 3000 and we can just ask a
00:12:54 simple question like
00:12:56 you know what is your address or what is
00:12:58 your balance or something like that.
00:13:00 There we go. All right. Right. So, check
00:13:02 my wallet balance.
00:13:12 Yeah. So, this is going to give you a
00:13:13 very basic AI agent that's ready to
00:13:16 query the graph uh either via MCP or
00:13:20 using XRO2. Uh it's kind of already
00:13:22 pre-programmed and and uh set up. I
00:13:25 believe there's this data tab which uh
00:13:28 you can find subgraphs in here. Um, and
00:13:31 you can like just get some assistance on
00:13:33 how to query data. Um, but yeah, for the
00:13:36 most part this looks like everything
00:13:39 works uh through here and we should be
00:13:42 good.
00:13:43 Okay, so uh I hope you guys found that
00:13:46 useful. So good luck building on the
00:13:47 graph. I hope you guys build something
00:13:49 awesome and uh yeah, let me know if you
00:13:51 have any issues uh any questions. You
00:13:53 can reach out to me on X. I am dev sec
00:13:56 ops with a Z. So, D E V S E C O P Z. Um,
00:14:02 and uh, yeah, hopefully you have any
00:14:04 don't have any issues and build
00:14:05 something cool. All right, catch you
00:14:07 guys next time. Bye.
```
