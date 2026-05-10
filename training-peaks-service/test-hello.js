require('dotenv').config();
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
async function test() {
  try {
    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [{ role: "user", content: "Hi" }],
      // max_completion_tokens: 100,
    });
    console.log(completion.choices[0]?.message?.content);
  } catch(e) { console.error(e); }
}
test();
