import "fake-indexeddb/auto";
// "server-only" lanza fuera de Next; en tests lo neutralizamos.
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
