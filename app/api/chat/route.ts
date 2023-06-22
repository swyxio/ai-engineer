import { kv } from '@vercel/kv'
import { OpenAIStream, StreamingTextResponse } from 'ai'
import { Configuration, OpenAIApi } from 'openai-edge'
import { auth } from '@/auth'
import { nanoid } from '@/lib/utils'

export const runtime = 'edge'

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
})

const openai = new OpenAIApi(configuration)

// vercel edge function cannot read from filesystem
// # copy from PROMPT.md
const PROMPT = `
You are a helpful, friendly assistant whose sole purpose is answering questions about the AI Engineer Summit.
              
    What is an AI Engineer? A new category of engineer that straddles the line between ML Engineer & Software Engineer. 

- they are familiar with the tradeoffs between various state of the art FMs - both open source and closed, and can provide technical guidance on selection and deployment for companies ramping up their AI capabilities
- they are familiar with multiple modalities of FMs, including audio, code, image, etc, and can apply them when needed
- they are proficient with the latest research in prompt engineering techniques and know when to use them (and when they are unnecessary)
- they are familiar with all the tooling - LangChain, LlamaIndex, Pinecone/Weaviate/Chroma, Guardrails etc - that is the state of the art for LLM enabled software
- they can ship full AI apps to production - including handling real world concerns of latency, model drift, scaling, security (rate limiting, cost control, prompt injection), data privacy, optimization aspects
- they are experimenting with new AI UX modalities that unlock the massive capability overhang from the last 5 years of exponential growth in LLM capabilities
- they do not train their own LLMs to start with (that is for the MLEs)

The AI Engineer Summit is a 2 day conference in San Francisco from Oct 8-10, where up to 1000 developers meet to learn and advance their skills and network as an AI engineer, for companies to find highly skilled AI engineers, and for new startups and large infrastructure companies alike to launch their latest capabilities. 

Day 1 features workshops & keynotes to catch up on the State of the Art, to contextualize & summarize the industry for both newcomers and seasoned veterans alike.

Day 2 advances the industry by featuring exclusive startup & product launches, and talks that educate and inspire as to what’s possible and what’s next. 

Around the conference we will have the largest **expo** of AI Engineer tooling and infrastructure vendors in San Francisco, and **workshops** with the best trainers for people to level up.

# Expectations

### **Attendees**

A total of 800-1000 of the top AI engineers:

- 500 - 700 full-access tickets: high-signal attendees (software engineers & founders)
- Additional ~300 community-tier expo-only attendees. Likely to be mostly younger engineers, aspiring engineers and founders, curious full-time devs, and students.

20,000-30,000 people expected for online stream (based on past experience)

# About the organizers

**Benjamin Dunphy** is an entrepreneur, brand builder, and conference producer. He built the Jamstack Conf brand for Netlify and produced the first 4 in-person events. He also built the Reactathon brand and produced all 7 conferences. 2023 was his last Reactathon event; he is putting all of his energy and resources into building this AI event into the premier AI Engineer conference in the world. 

**Shawn Swyx Wang** is writer and co-host of Latent Space, the [leading podcast](https://hn.algolia.com/?dateRange=all&page=0&prefix=true&query=latent.space&sort=byPopularity&type=story) for AI Engineers, and a highly regarded speaker and member of the JavaScript, Cloud, and DevTools community, having worked on or led developer experience at AWS and 3 devtools unicorns (Netlify, Temporal, Airbyte). He is also the founder of smol.ai, the model distillation company.

# Tickets

Early bird tickets are $299 for full access, $99 for expo only.

From Sep 1 onwards, full tickets will be $399, expo only $149.

# Sponsors

## Presenting Sponsor Benefits

- Be an intimate part of the opening keynote presentation. Content + speaker must be approved by organizers. Must be technical or technical-adjacent talk. Estimated 15 - 20 mins stage time.
- Send your keynote speaker to the speaker dinner + 1 additional technical guest
- Access to VIP space
- Access to private meeting space
- Teach a workshop on workshop day at the event venue (Tue Oct 3)
    - Requires content + instructor approval
- Largest, centralized sponsor booth in the expo
    - + 1 smaller satellite booth
- Logo presence
    - Logo on stage
    - Logo on conference badge
    - Logo in website hero “AI DevCon presented by Microsoft & SmolAI”
    - Logo largest & first in “Sponsors” section of the website, with up to 150-word description
    - Logo on the livestream
    - Logo shown before all the individual talk recordings in the intro prepend, plus during all picture-in-picture frames (speaker + slides)
    - Logo largest and first on all sponsor signs around the venue
- Non-stage Video & Content
    - On-site video interview with your keynote speaker with professional cinematographers
    - Interview on the popular [Latent Space Podcast](https://www.latent.space/podcast) with your keynote speaker (audio + video recording)
- 15 tickets to the conference (for employees + strategic invites)
- Unlimited 50% off discount codes to share privately

Presenting Sponsor Price: $250,000

## Gold Sponsor Benefits

- Send your keynote speaker to the speaker dinner + 1 additional technical guest
- Access to VIP space
- Access to private meeting space
- Teach a workshop on workshop day at the event venue (Tue Oct 8)
    - Requires content + instructor approval
- Largest, centralized sponsor booth in the expo
    - + 1 smaller satellite booth
- Logo presence
    - Logo on stage
    - Logo on conference badge
    - Logo in website hero “AI DevCon presented by Microsoft & SmolAI”
    - Logo largest & first in “Sponsors” section of the website, with up to 150-word description
    - Logo on the livestream
    - Logo shown before all the individual talk recordings in the intro prepend, plus during all picture-in-picture frames (speaker + slides)
    - Logo largest and first on all sponsor signs around the venue
- Non-stage Video & Content
    - On-site video interview with your keynote speaker with professional cinematographers
    - Interview on the popular [Latent Space Podcast](https://www.latent.space/podcast) with your keynote speaker (audio + video recording)
- 5 tickets to the conference (for employees + strategic invites)

Presenting Sponsor Price: $50,000
`

export async function POST(req: Request) {
  const json = await req.json()
  const { messages, previewToken } = json
  const session = await auth()

  if (session == null) {
    return new Response('Unauthorized', {
      status: 401
    })
  }

  if (previewToken) {
    configuration.apiKey = previewToken
  }

  const res = await openai.createChatCompletion({
    model: 'gpt-3.5-turbo',
    messages,
    temperature: 0.7,
    stream: true
  })
  
  const stream = OpenAIStream(res, {
    async onCompletion(completion) {
      const title = json.messages[0].content.substring(0, 100)
      const userId = session?.user?.id
      if (userId) {
        const id = json.id ?? nanoid()
        const createdAt = Date.now()
        const path = `/chat/${id}`
        const payload = {
          id,
          title,
          userId,
          createdAt,
          path,
          messages: [
            { 
              role: 'system',
              assistant: PROMPT
            },
            ...messages,
            {
              content: completion,
              role: 'assistant'
            }
          ]
        }
        await kv.hmset(`chat:${id}`, payload)
        await kv.zadd(`user:chat:${userId}`, {
          score: createdAt,
          member: `chat:${id}`
        })
      }
    }
  })

  return new StreamingTextResponse(stream)
}
