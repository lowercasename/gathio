import "express";
import { GathioConfig } from "./lib/config.js";

interface Locals {
    config: GathioConfig;
}

declare module "express" {
    export interface Response {
        locals: {
            config?: GathioConfig;
        };
    }
}
