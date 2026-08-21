"""Structured Output schema for the generated concept map."""


CONCEPT_CATEGORIES = [
    "identity",
    "interest",
    "project",
    "research",
    "tech-skill",
    "tool",
    "music",
    "books",
    "thought",
]


CONCEPT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "concepts": {
            "type": "array",
            "minItems": 12,
            "maxItems": 36,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "label": {"type": "string", "minLength": 1, "maxLength": 40},
                    "summary": {"type": "string", "minLength": 1, "maxLength": 180},
                    "weight": {"type": "integer", "minimum": 1, "maximum": 100},
                    "category": {"type": "string", "enum": CONCEPT_CATEGORIES},
                    "related": {
                        "type": "array",
                        "maxItems": 6,
                        "items": {"type": "string", "minLength": 1, "maxLength": 40},
                    },
                    "evidence": {
                        "type": "array",
                        "minItems": 1,
                        "maxItems": 6,
                        "items": {"type": "string", "minLength": 1, "maxLength": 120},
                    },
                },
                "required": [
                    "label",
                    "summary",
                    "weight",
                    "category",
                    "related",
                    "evidence",
                ],
            },
        }
    },
    "required": ["concepts"],
}
