export async function processWithDocumentAI({
  projectId,
  location,
  processorId,
  accessToken,
  base64Image,
  mimeType
}) {
  const url =
    `https://${location}-documentai.googleapis.com/v1/projects/${projectId}` +
    `/locations/${location}/processors/${processorId}:process`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      rawDocument: {
        content: base64Image,
        mimeType
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Document AI error: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  return normalizeDocumentAIResponse(data);
}

function normalizeDocumentAIResponse(data) {
  const document = data.document || {};
  const text = document.text || "";
  const entities = document.entities || [];

  const fields = {};

  for (const entity of entities) {
    const key = normalizeKey(entity.type || entity.mentionText || "unknown");
    const value = entity.mentionText || "";
    const confidence = entity.confidence || 0;

    if (!fields[key] || confidence > fields[key].confidence) {
      fields[key] = {
        value,
        confidence
      };
    }
  }

  const regexFallbackFields = extractFallbackFieldsFromText(text);

  return {
    text,
    fields: {
      ...regexFallbackFields,
      ...fields
    },
    raw: data
  };
}

function normalizeKey(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, chr) => chr.toUpperCase());
}

function extractFallbackFieldsFromText(text) {
  const fields = {};

  const dateMatches = text.match(/\b\d{2}[/-]\d{2}[/-]\d{4}\b|\b\d{4}[/-]\d{2}[/-]\d{2}\b/g) || [];

  if (dateMatches[0]) {
    fields.dateOfBirth = {
      value: normalizeDate(dateMatches[0]),
      confidence: 0.45,
      source: "regexFallback"
    };
  }

  if (dateMatches[1]) {
    fields.issueDate = {
      value: normalizeDate(dateMatches[1]),
      confidence: 0.45,
      source: "regexFallback"
    };
  }

  if (dateMatches[2]) {
    fields.expiryDate = {
      value: normalizeDate(dateMatches[2]),
      confidence: 0.45,
      source: "regexFallback"
    };
  }

  const cdcMatch = text.match(/\b[A-Z]{1,4}[/-]?\d{4,12}\b/i);
  if (cdcMatch) {
    fields.documentNumber = {
      value: cdcMatch[0],
      confidence: 0.4,
      source: "regexFallback"
    };
  }

  return fields;
}

function normalizeDate(value) {
  const clean = value.replaceAll("/", "-");

  const ddmmyyyy = clean.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddmmyyyy) {
    return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  }

  return clean;
}