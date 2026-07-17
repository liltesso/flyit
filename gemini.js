const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

/**
 * Call Google Gemini 1.5/2.0 Flash API and return parsed JSON
 * @param {string} prompt 
 * @returns {Promise<object>} Parsed JSON candidate content
 */
async function callGemini(prompt) {
    if (!GEMINI_KEY) {
        throw new Error('GEMINI_API_KEY is not configured in your environment.');
    }
    
    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.85,
                maxOutputTokens: 1024
            }
        })
    });
    
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API returned code ${res.status}: ${errText}`);
    }
    
    const data = await res.json();
    let text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Strip markdown code block wraps (```json ... ```)
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    
    try {
        return JSON.parse(text);
    } catch(e) {
        // Fallback: extract JSON boundaries { ... }
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
            return JSON.parse(match[0]);
        }
        throw new Error('Failed to parse Gemini candidate text as JSON: ' + text.substring(0, 150));
    }
}

module.exports = {
    callGemini,
    GEMINI_KEY,
    GEMINI_URL
};
