import type { BenchmarkTestCase } from "./types.ts";

export const STRATXCEL_BENCHMARK_WORKLOADS: BenchmarkTestCase[] = [
  {
    id: "task_1_basic_text",
    category: "basic_text",
    title: "Basic Text: Elevator Pitch & Positioning",
    description: "Generate a concise 2-sentence value proposition for a regional solar installation provider.",
    messages: [
      {
        role: "system",
        content: "You are an expert marketing strategist for local businesses. Be concise, punchy, and professional.",
      },
      {
        role: "user",
        content:
          "Write a 2-sentence positioning statement and elevator pitch for 'Apex Mountain Solar', a residential solar panel installer based in Boulder, Colorado. Focus on reducing winter utility bills and regional battery storage reliability.",
      },
    ],
  },
  {
    id: "task_2_structured_json",
    category: "structured_json",
    title: "Structured JSON: Social Post Blueprint",
    description: "Generate a strictly typed JSON blueprint for a weekly promotional campaign.",
    messages: [
      {
        role: "system",
        content:
          "You are StratXcel's automated content planning engine. Always respond with valid JSON matching the requested structure.",
      },
      {
        role: "user",
        content:
          "Generate a social post blueprint for an artisan sourdough bakery. Respond ONLY with a JSON object containing keys: 'title' (string), 'postFormat' (enum: 'carousel'|'reel'|'static_image'), 'hookText' (string), 'callToAction' (string), 'tags' (array of 4 strings), and 'estimatedReadingTimeSeconds' (number).",
      },
    ],
    responseFormat: { type: "json_object" },
    jsonSchema: {
      type: "object",
      required: ["title", "postFormat", "hookText", "callToAction", "tags", "estimatedReadingTimeSeconds"],
      properties: {
        title: { type: "string" },
        postFormat: { type: "string", enum: ["carousel", "reel", "static_image"] },
        hookText: { type: "string" },
        callToAction: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        estimatedReadingTimeSeconds: { type: "number" },
      },
    },
  },
  {
    id: "task_3_content_caption",
    category: "content_caption",
    title: "Content Generation: High-Converting Instagram Caption",
    description: "Generate high-converting social copy with hook, value points, CTA, and targeted hashtags.",
    messages: [
      {
        role: "system",
        content:
          "You are Social Autopilot, an AI copywriter that crafts high-conversion social media captions for luxury and boutique healthcare clinics.",
      },
      {
        role: "user",
        content:
          "Write an Instagram caption for 'Lumina Smiles Boutique Dental' promoting their same-day porcelain veneer consultations. Include: 1) A pattern-interrupt opening hook, 2) 3 short benefit bullet points, 3) A clear booking CTA directing to the bio link, and 4) Exactly 5 targeted hashtags. Do not use generic filler.",
      },
    ],
  },
  {
    id: "task_4_strategy_reasoning",
    category: "strategy_reasoning",
    title: "Strategy & Reasoning: Local Search Audit & Growth Plan",
    description: "Analyze a local business's performance profile and synthesize a 3-step growth action plan.",
    messages: [
      {
        role: "system",
        content: "You are StratXcel's Lead Growth Architect. Provide actionable, high-ROI recommendations based on client diagnostic data.",
      },
      {
        role: "user",
        content:
          "Audit Report:\n- Business: CrossFit Iron Harbor (Austin, TX)\n- Google Business Profile: 4.1 stars across 19 reviews. Last review received 4 months ago.\n- Organic Search: Ranks #12 for 'gym near me', #4 for 'crossfit gym downtown austin'.\n- Instagram: 850 followers, 0.4% engagement rate, last post 3 weeks ago.\n- Website: Fast mobile load (92 PageSpeed), but no lead magnet, no phone click-to-call in header, no intro offer form.\n\nSynthesize a prioritized 3-step 30-day growth plan. For each step provide: 1) Focus Area, 2) Exact Tactical Action, 3) Expected Outcome metric.",
      },
    ],
  },
  {
    id: "task_5_tool_calling",
    category: "tool_calling",
    title: "Tool Calling: Customer Metric Retrieval",
    description: "Invoke a registered function call with correctly formatted JSON parameters.",
    messages: [
      {
        role: "system",
        content: "You are an AI assistant with access to client analytics tools. When requested to query data, call the appropriate tool.",
      },
      {
        role: "user",
        content: "Please look up the conversion metrics and ad spend for client 'tenant_8829' between '2026-08-01' and '2026-08-31'.",
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "query_client_metrics",
          description: "Query historical performance metrics for a specific tenant and date range.",
          parameters: {
            type: "object",
            required: ["tenantId", "startDate", "endDate", "metrics"],
            properties: {
              tenantId: { type: "string", description: "The tenant or client ID" },
              startDate: { type: "string", description: "ISO date YYYY-MM-DD" },
              endDate: { type: "string", description: "ISO date YYYY-MM-DD" },
              metrics: {
                type: "array",
                items: { type: "string" },
                description: "Metrics to fetch, e.g. ['conversions', 'ad_spend', 'impressions']",
              },
            },
          },
        },
      },
    ],
  },
  {
    id: "task_6_vision_analysis",
    category: "vision_analysis",
    title: "Vision & Image Analysis: Layout & Visual Hierarchy Review",
    description: "Analyze visual creative layout and typography balance using multimodal input.",
    messages: [
      {
        role: "system",
        content: "You are a senior creative director reviewing advertising banner compositions.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Analyze the visual clarity of this minimalist promotional graphic. Specifically evaluate if the contrast between the dark navy background and the metallic gold headline is sufficient for mobile feed legibility, and recommend the ideal CTA placement.",
          },
          {
            type: "image_url",
            image_url: {
              // Valid 1x1 base64 transparent PNG data URI for universal multimodal testing
              url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
              detail: "low",
            },
          },
        ],
      },
    ],
  },
  {
    id: "task_7_embeddings",
    category: "embeddings",
    title: "Embeddings: Business Domain Semantic Search",
    description: "Generate high-dimensional vector embeddings for business taxonomy indexing.",
    messages: [
      {
        role: "user",
        content: "residential rooftop solar panels photovoltaic inverter battery backup clean energy storage",
      },
    ],
  },
];
