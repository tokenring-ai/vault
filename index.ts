import {TokenRingPlugin} from "@tokenring-ai/app";
import packageJSON from './package.json' with {type: 'json'};

export const packageInfo: TokenRingPlugin = {
  name: packageJSON.name,
  version: packageJSON.version,
  description: packageJSON.description
};


export {default as VaultService} from "./VaultService.ts";