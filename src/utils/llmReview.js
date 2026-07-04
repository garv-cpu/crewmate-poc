const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";

export async function runLLMExceptionReview({
  classification,
  extractedFields,
  validationIssues
}) {
  if (!GEMINI_API_KEY) {
    return {
      skipped: true,
      reason: "No VITE_GEMINI_API_KEY found. LLM review skipped for POC.",
      suggestedAction: "Manual admin review required."
    };
  }

  const prompt = `
You are reviewing extracted maritime document data for a POC.

Important:
- Do not mark the document as officially verified.
- Only review whether extracted fields look internally consistent.
- Return JSON only.

Classification:
${JSON.stringify(classification, null, 2)}

Extracted fields:
${JSON.stringify(extractedFields, null, 2)}

Validation issues:
${JSON.stringify(validationIssues, null, 2)}

Return JSON with:
{
  "riskLevel": "LOW" | "MEDIUM" | "HIGH",
  "likelyDocumentType": "...",
  "summary": "...",
  "fieldsToManuallyCheck": ["..."],
  "canProceedToAdminReview": true | false
}
`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    return {
      skipped: false,
      error: `LLM call failed: ${response.status} ${errorText}`,
      suggestedAction: "Manual admin review required."
    };
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  try {
    return JSON.parse(text);
  } catch {
    return {
      rawResponse: text,
      suggestedAction: "Manual admin review required."
    };
  }
}