/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GITHUB_REPOSITORY_OWNER: string;
  readonly VITE_GITHUB_REPOSITORY_NAME: string;
  readonly VITE_GITHUB_PAT_NAME: string;
  readonly VITE_GITHUB_PAT_DESCRIPTION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
