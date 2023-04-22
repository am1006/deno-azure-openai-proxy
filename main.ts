import { serve } from "https://deno.land/std@0.181.0/http/server.ts";

// The name of your Azure OpenAI Resource.
const resourceName = Deno.env.get("RESOURCE_NAME") || "null";

// The version of OpenAI API.
const apiVersion = Deno.env.get("API_VERSION") || "2021-03-15-preview";

// The mapping of model name.
type MapperType = {
  [key: string]: string;
};
const mapper: MapperType = {
  "gpt-3.5-turbo": "gpt_35",
  "gpt-4": "gpt_4",
  "gpt-4-32k": "gpt_4_32k",
  // Other mapping rules can be added here.
};

async function handleRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return handleOPTIONS(request);
  }

  const url = new URL(request.url);

  let path: string;

  if (url.pathname === "/") {
    // Health check
    const html = `
    <html>
      <head>
        <title>Azure API</title>
        <style>
          body {  
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
            font-size: 1.2rem;
            line-height: 1.5;
            color: #333;
          }
          .container {
            max-width: 800px;
            margin: 0 auto;
            padding: 0 1rem;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Hello World!</h1>
          <p>The quieter you become, the more you are able to hear.</p>
        </div>
      </body>
    </html>
    `;

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=UTF-8",
      },
      status: 200,
    });
  }
  if (url.pathname === "/v1/chat/completions") {
    // Chat
    path = "chat/completions";
  } else if (url.pathname === "/v1/completions") {
    // Other completions
    path = "completions";
  } else if (url.pathname === "/v1/models") {
    // Others
    return await handleModels(request);
  } else {
    return new Response("404 Not Found", { status: 404 });
  }

  // Get the value of the model field and perform mapping.
  let deployName = "";

  let body;

  if (request.method === "POST") {
    body = await request.json();
    const modelName: string | undefined = body?.model;

    if (modelName) {
      deployName = mapper[modelName] || modelName;
    }
  }

  const fetchAPI = `https://${resourceName}.openai.azure.com/openai/deployments/${deployName}/${path}?api-version=${apiVersion}`;

  const authKey: string | null = request.headers.get("Authorization");

  // Add a very basic API key check.
  if (!authKey || authKey !== Deno.env.get("API_KEY")) {
    return new Response("Not allowed: Key Error", { status: 403 });
  }

  const payload: RequestInit = {
    method: request.method,
    headers: {
      "Content-Type": "application/json",
      "api-key": Deno.env.get("AZURE_API_KEY") || "",
    },
    body: JSON.stringify(body),
  };

  const { readable, writable } = new TransformStream();

  const response: Response = await fetch(fetchAPI, payload);

  if (response.body) {
    stream(response.body, writable);

    return new Response(readable, response);
  } else {
    throw new Error("Response body is null");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// support printer mode and add newline
async function stream(
  readable: ReadableStream<Uint8Array>,
  writable: WritableStream<Uint8Array>
): Promise<void> {
  const reader = readable.getReader();
  const writer = writable.getWriter();

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const newline = "\n";
  const delimiter = "\n\n";
  const encodedNewline = encoder.encode(newline);

  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true }); // stream: true is important here,fix the bug of incomplete line
    const lines = buffer.split(delimiter);

    // Loop through all but the last line, which may be incomplete.
    for (let i = 0; i < lines.length - 1; i++) {
      await writer.write(encoder.encode(lines[i] + delimiter));
      await sleep(30);
    }

    buffer = lines[lines.length - 1];
  }

  if (buffer) {
    await writer.write(encoder.encode(buffer));
  }
  await writer.write(encodedNewline);
  await writer.close();
}

function handleModels(_: Request): Response {
  const data = {
    object: "list",
    data: [
      {
        id: "gpt-3.5-turbo",
        object: "model",
        created: 1677610602,
        owned_by: "openai",
        permission: [
          {
            id: "modelperm-M56FXnG1AsIr3SXq8BYPvXJA",
            object: "model_permission",
            created: 1679602088,
            allow_create_engine: false,
            allow_sampling: true,
            allow_logprobs: true,
            allow_search_indices: false,
            allow_view: true,
            allow_fine_tuning: false,
            organization: "*",
            group: null,
            is_blocking: false,
          },
        ],
        root: "gpt-3.5-turbo",
        parent: null,
      },
    ],
  };
  const json: string = JSON.stringify(data, null, 2);

  return new Response(json, {
    headers: { "Content-Type": "application/json" },
  });
}

function handleOPTIONS(_: Request): Response {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "*",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
serve(handleRequest);
