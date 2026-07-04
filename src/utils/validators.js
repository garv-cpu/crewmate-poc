import { COUNTRY_SCHEMAS } from "../config/countrySchemas";

export function classifyDocument(docAiResult) {
  const text = `${docAiResult.text || ""}`.toLowerCase();

  if (
    text.includes("india") ||
    text.includes("government of india") ||
    text.includes("dg shipping") ||
    text.includes("indos") ||
    text.includes("continuous discharge certificate")
  ) {
    return {
      schemaKey: "INDIA_CDC",
      country: "India",
      documentType: "CDC",
      confidence: 0.85,
      method: "textRules"
    };
  }

  if (
    text.includes("philippines") ||
    text.includes("marina") ||
    text.includes("seafarer's record book") ||
    text.includes("seafarer record book")
  ) {
    return {
      schemaKey: "PHILIPPINES_SRB",
      country: "Philippines",
      documentType: "SRB",
      confidence: 0.85,
      method: "textRules"
    };
  }

  return {
    schemaKey: "UNKNOWN",
    country: "Unknown",
    documentType: "Unknown",
    confidence: 0.2,
    method: "fallback"
  };
}

export function validateExtractedFields(docAiResult, classification) {
  const schema = COUNTRY_SCHEMAS[classification.schemaKey] || COUNTRY_SCHEMAS.UNKNOWN;
  const fields = docAiResult.fields || {};
  const issues = [];
  const passed = [];

  for (const requiredField of schema.requiredFields) {
    const field = fields[requiredField];

    if (!field?.value) {
      issues.push({
        field: requiredField,
        type: "MISSING_FIELD",
        message: `${requiredField} is missing.`
      });
      continue;
    }

    passed.push({
      field: requiredField,
      type: "FIELD_PRESENT",
      value: field.value
    });

    const pattern = schema.patterns?.[requiredField];

    if (pattern && !pattern.test(String(field.value))) {
      issues.push({
        field: requiredField,
        type: "INVALID_FORMAT",
        value: field.value,
        message: `${requiredField} has invalid format.`
      });
    }
  }

  const dateIssue = validateDateOrder(fields);
  if (dateIssue) {
    issues.push(dateIssue);
  }

  const lowConfidenceFields = Object.entries(fields)
    .filter(([, field]) => typeof field.confidence === "number" && field.confidence < 0.65)
    .map(([fieldName, field]) => ({
      field: fieldName,
      confidence: field.confidence
    }));

  for (const item of lowConfidenceFields) {
    issues.push({
      field: item.field,
      type: "LOW_CONFIDENCE",
      confidence: item.confidence,
      message: `${item.field} confidence is low.`
    });
  }

  const shouldEscalateToLLM =
    issues.length > 0 ||
    classification.schemaKey === "UNKNOWN" ||
    classification.confidence < 0.7;

  return {
    schemaUsed: classification.schemaKey,
    passed,
    issues,
    shouldEscalateToLLM,
    finalPocStatus: shouldEscalateToLLM ? "NEEDS_REVIEW" : "POC_RULES_PASSED",
    officialVerificationStatus: "NOT_OFFICIALLY_VERIFIED"
  };
}

function validateDateOrder(fields) {
  const issue = parseDate(fields.issueDate?.value);
  const expiry = parseDate(fields.expiryDate?.value);

  if (!issue || !expiry) return null;

  if (expiry <= issue) {
    return {
      field: "expiryDate",
      type: "INVALID_DATE_ORDER",
      message: "Expiry date must be after issue date."
    };
  }

  return null;
}

function parseDate(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}