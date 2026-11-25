import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/** Listen on a free loopback port and return it: the tests' fake GitHub and Jira never leave the machine. */
export async function listenLocal(server: Server): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    server.once("error", reject).listen(0, "127.0.0.1", () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
}
