declare module "node-cron" {
    declare interface CronTask {
        public stop();
    }

    export function schedule(cron: string, callback: () => void): CronTask;
    export function schedule(cron: null, callback: () => void | null): never;
}