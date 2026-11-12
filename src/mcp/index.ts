import readline from "node:readline";
import { createLocalStorageAdapter } from "../server/storage/local.ts";
import type { RemoteMcpEnvironmentConfig, StorageAdapter } from "../server/types.ts";
import {
  ContextDropMcpDispatcher,
  MCP_PROTOCOL_VERSION,
  type ContextDropMcpOptions,
  type JsonRpcResponse
} from "./dispatcher.ts";

export {
  ContextDropMcpDispatcher,
  MCP_PROTOCOL_VERSION,
  type ContextDropMcpOptions,
  type JsonRpcResponse
};
export {
  EnvironmentRouter,
  redactEndpointUrl,
  resolveEffectiveMcpEnvironments,
  resolveHostEnvironment,
  type AvailableMcpEnvironmentInfo,
  type EnvVarMap,
  type NormalizedRemoteEnvConfig
} from "./environment-router.ts";
export {
  RemoteMcpClient,
  RemoteMcpError,
  validateRemoteMcpUrl,
  type McpContentBlock,
  type McpToolResult,
  type RemoteMcpTransport
} from "./remote-client.ts";

export function createContextDropMcpServer(options: Partial<ContextDropMcpOptions> = {}) {
  const storage: StorageAdapter =
    options.storage ??
    createLocalStorageAdapter({
      dir: process.env.CONTEXT_DROP_STORAGE_DIR
    });

  const dispatcher = new ContextDropMcpDispatcher({
    ...options,
    storage
  });

  return {
    dispatcher,
    handleHttpPayload: async (
      payload: unknown,
      httpOptions: { localOnly?: boolean } = { localOnly: true }
    ) => {
      if (httpOptions.localOnly !== false) {
        const localOnlyDispatcher = new ContextDropMcpDispatcher({
          ...options,
          storage,
          localOnly: true
        });
        return localOnlyDispatcher.dispatch(payload);
      }
      return dispatcher.dispatch(payload);
    }
  };
}

export interface StdioWritableLike {
  write(chunk: string): unknown;
}

export interface StdioMcpRunnerOptions {
  storage?: StorageAdapter;
  storageDir?: string;
  hostEnvironment?: string;
  environments?: Record<string, RemoteMcpEnvironmentConfig>;
  input?: AsyncIterable<Uint8Array | string>;
  output?: StdioWritableLike;
  error?: StdioWritableLike;
}

export async function runContextDropMcpStdio(
  options: StdioMcpRunnerOptions = {}
): Promise<void> {
  const input = (options.input ?? process.stdin) as NodeJS.ReadableStream;
  const output = options.output ?? process.stdout;
  const errorOut = options.error ?? process.stderr;

  const storage =
    options.storage ??
    createLocalStorageAdapter({
      dir: options.storageDir || process.env.CONTEXT_DROP_STORAGE_DIR
    });

  const dispatcher = new ContextDropMcpDispatcher({
    storage,
    hostEnvironment: options.hostEnvironment,
    environments: options.environments,
    localOnly: false
  });

  const rl = readline.createInterface({
    input,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    const stripped = line.trim();
    if (!stripped) continue;

    let response: JsonRpcResponse | JsonRpcResponse[] | null = null;
    try {
      const parsed = JSON.parse(stripped) as unknown;
      response = await dispatcher.dispatch(parsed);
    } catch (err) {
      response = {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: `Parse error: ${(err as Error).message}`
        }
      };
    }

    if (response !== null) {
      output.write(`${JSON.stringify(response)}\n`);
    }
  }

  if (process.env.CONTEXT_DROP_MCP_DEBUG === "1") {
    errorOut.write("[context-drop] MCP stdio session closed.\n");
  }
}
