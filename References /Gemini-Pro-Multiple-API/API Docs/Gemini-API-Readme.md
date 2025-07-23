
# 💻 Gemini 2.5 Pro / Flash API for Coding (No SDK, JavaScript Only)

This guide shows how to use **Google Gemini 2.5 Pro or Flash** models via **raw HTTP API**, for coding tasks like writing, explaining, or debugging code.

✅ No SDKs required  
✅ Works in JavaScript (fetch)  
✅ Suitable for beginners

---

## 🔐 1. Get Your API Key

1. Go to 👉 [https://makersuite.google.com/app](https://makersuite.google.com/app)
2. Click **"Get API key"**
3. Copy it and save it somewhere safe.

> **Note:** Never put your API key in public frontend code. Always use it on a secure backend or localhost.

---

## 🔗 2. API Endpoints

| Model            | Endpoint |
|------------------|----------|
| Gemini 2.5 Pro   | `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent` |
| Gemini 2.5 Flash | `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent` |

---

## 📤 3. Send a Request (JavaScript)

```js
const API_KEY = "your-api-key";
const model = "gemini-2.5-flash"; // or "gemini-2.5-pro"

async function askGemini(prompt) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": API_KEY
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          topP: 0.95,
          candidateCount: 1,
          maxOutputTokens: 512
        },
        thinkingConfig: {
          thinkingBudget: 0  // Flash only. Set -1 for dynamic thinking.
        }
      })
    }
  );

  const data = await response.json();
  console.log(data.candidates[0].content.parts[0].text);
}
````

---

## 🧠 4. Prompt Examples for Code Tasks

```js
askGemini("Write a Python function to reverse a string.");
askGemini("Explain this JavaScript code: const sum = (a, b) => a + b;");
askGemini("Fix this buggy C++ code: int main() { cout << Hello }");
askGemini("Return a JSON object listing 3 Java methods with name and description.");
```

---

## ⚙️ 5. Parameters Cheat Sheet

| Parameter         | What it does                          | Recommended |
| ----------------- | ------------------------------------- | ----------- |
| `temperature`     | More random = higher number           | `0.7`       |
| `topP`            | Controls diversity of tokens          | `0.95`      |
| `candidateCount`  | How many completions to return        | `1`         |
| `maxOutputTokens` | Max words in response                 | `512`       |
| `thinkingBudget`  | Flash only – controls model reasoning | `0` or `-1` |

---

## 📏 6. Model Token Limits

Maximum tokens = input + output combined.

```js
const modelMaxTokens = {
  "gemma-3-27b-it": 8192,
  "gemini-2.5-pro": 65536,
  "gemini-2.5-flash": 65536,
  "gemini-2.0-flash": 8192
};
```

> ⚠️ If your input prompt is too long, reduce it or lower `maxOutputTokens`.

---

## 🔄 7. Multiple Answers

Get multiple suggestions:

```js
candidateCount: 3
```

Print all:

```js
data.candidates.forEach((c, i) => {
  console.log(`Answer ${i + 1}:`, c.content.parts[0].text);
});
```

---

## 🛠️ 8. Optional: System Instructions

Make the model follow your style:

```json
"systemInstruction": {
  "parts": [{
    "text": "Always use modern ES6 syntax and add comments in your code."
  }]
}
```

---

## 🚫 9. Safety Notes

* ❗ Don’t hardcode your API key in browser code.
* ❗ Flash supports `thinkingConfig`, but Pro **ignores it**.
* ✅ Always check if `response.ok` before reading the result.
* ⚠️ Watch for rate limits (HTTP 429). Add retry logic if needed.

---

## ✅ 10. Summary

| Feature          | Gemini 2.5 Pro  | Gemini 2.5 Flash |
| ---------------- | --------------- | ---------------- |
| Fast response    | ❌ Slower        | ✅ Faster         |
| Deep thinking    | ✅ Always ON     | ✅ Configurable   |
| Cost-efficient   | ❌ Expensive     | ✅ Cheaper        |
| Max input length | ✅ 65,536 tokens | ✅ 65,536 tokens  |
| Best for         | Tough problems  | Everyday coding  |

---

## 📎 Resources

* Official Docs: [https://ai.google.dev/gemini-api/docs](https://ai.google.dev/gemini-api/docs)
* Token counter: [https://platform.openai.com/tokenizer](https://platform.openai.com/tokenizer)
