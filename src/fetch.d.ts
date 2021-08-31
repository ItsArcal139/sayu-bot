declare module "node-fetch" {
    export default function fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
}