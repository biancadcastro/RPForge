export type Issue = { severity: string; message: string };
export type Archive = {
  archive: string;
  ok: boolean;
  kind?: string;
  error?: string;
  cancelled?: boolean;
  output?: string;
  outputName?: string;
  defaultName?: string;
  exists?: boolean;
  models?: string[];
  finalModels?: string[];
  sourceBytes?: number;
  generated?: string[];
  audit?: {
    ok?: boolean;
    errors?: number;
    warnings?: number;
    diskBytes?: number;
    issues: Issue[];
  };
};
export type Choice = {
  selected?: boolean;
  outputName?: string;
  spawns?: Record<string, string>;
  existing?: "backup" | "cancel";
};
export type Choices = Record<string, Choice>;
export type Launch = {
  loginRequired?: boolean;
  mode: "full" | "quick";
  action: "preview" | "ytyp" | "obj" | "neon" | "skin";
  folder: string;
  clothing?: {model:string;texture:string;destination:string;candidates:string[];directory?:string};
};
export type Progress = {
  phase: string;
  label?: string;
  current?: number;
  total?: number;
};
export type Response = { data: Archive[]; reviewId: string | null };
export type AccountProfile = { displayName: string; avatarUrl: string | null };
export type BrowserAuthState = {status:'idle'|'starting'|'waiting'|'connected'|'error';provider?:string;message?:string};
export type ToolId = "converter" | "ytyp";
export type Screen = "home" | "help" | "account" | "clothing" | "neon" | "skin" | ToolId;
export type SkinRole='skin'|'cloth'|'uncertain';
export type SkinMesh={positions:number[];normals:number[];uv:number[];indices:number[];faceIds:string[];role:SkinRole};
export type SkinReview={reviewId:string;lods:{lod:string;skin:number;cloth:number;uncertain:number}[];canSplit:boolean;reason:string|null;previews:Record<string,{meshes:SkinMesh[]}>};
export type SkinResult={output:string;roles:Record<'skin'|'cloth',{id:string;model:string;texture:string|null}>;files:string[];elapsedMs:number;lods:SkinReview['lods'];partitionPreserved:boolean;attributesPreserved:boolean;rigPreserved:boolean;materialsPreserved:boolean;texturesPreserved:boolean};
export type NeonResult = {output:string;model:string;texture:string|null;drawableId:string;files:string[];elapsedMs:number;geometryPreserved:boolean;rigPreserved:boolean;embeddedPreserved:boolean;shader:string;lods:{lod:string;vertices:number;triangles:number}[]};
export type ClothingSelection={model:string;texture:string;destination:string};
export type ClothingResult = { output: string; objFile: string; mtlFile:string; lod: string; vertices: number; triangles: number; meshes: number; materials: number; elapsedMs: number; files: string[]; notes: string[]; textures: {id:string;name:string;width:number;height:number}[] };
export type ClothingPreview = {obj:string;textures:Record<string,string>;groups:{name:string;material:string;texture:string;shader:string;color?:string;faceIds?:string[]}[]};
export type AuthOptions = {
  passwordAuthEnabled: boolean;
  providers: { provider: string; enabled: boolean }[];
};
export type Draft = {
  folder: string;
  items: Archive[];
  choices: Choices;
  reviewId: string | null;
  step: "configure" | "review" | "result";
  results: Archive[];
  error: string;
};
export const emptyDraft = (): Draft => ({
  folder: "",
  items: [],
  choices: {},
  reviewId: null,
  step: "configure",
  results: [],
  error: "",
});
export interface DesktopBridge {
  windowControl(action:'state'|'minimize'|'maximize'|'close'):Promise<{maximized:boolean}>;
  onWindowState(callback:(state:{maximized:boolean})=>void):()=>void;
  bootstrap(): Promise<Launch>;
  selectFolder(): Promise<string | null>;
  selectClothingFile(kind: 'model' | 'texture' | 'destination',tool?:'obj'|'neon'|'skin'): Promise<string | null>;
  selectClothingTexture(texture: string,tool?:'obj'|'neon'|'skin'): Promise<string>;
  inspectClothingSkin(selection:ClothingSelection):Promise<SkinReview>;
  separateClothingSkin(selection:ClothingSelection,reviewId:string,overrides:Record<string,'skin'|'cloth'>):Promise<SkinResult>;
  convertClothingNeon(selection:ClothingSelection):Promise<NeonResult>;
  exportClothingObj(lod: string,selection:ClothingSelection): Promise<ClothingResult>;
  cancelClothingExport(): Promise<void>;
  clothingPreview(): Promise<ClothingPreview>;
  preview(folder: string, choices: Choices): Promise<Response>;
  convert(folder: string, reviewId: string): Promise<Response>;
  ytyp(folder: string): Promise<Response>;
  openFolder(folder: string): Promise<void>;
  openFull(): Promise<void>;
  profile(): Promise<AccountProfile | null>;
  authOptions(): Promise<AuthOptions>;
  signIn(
    email: string,
    password: string,
  ): Promise<{ mfaRequired: boolean; challengeToken?: string }>;
  verifyMfa(challengeToken: string, code: string): Promise<void>;
  startOAuth(provider: string): Promise<void>;
  browserAuthState():Promise<BrowserAuthState>;
  cancelBrowserAuth():Promise<void>;
  onBrowserAuth(callback:(state:BrowserAuthState)=>void):()=>void;
  onAuthChallenge(callback: (challenge: string) => void): () => void;
  onAuthError(callback: (message: string) => void): () => void;
  onProfile(callback: (profile: AccountProfile | null) => void): () => void;
  close(): Promise<void>;
  onProgress(callback: (progress: Progress) => void): () => void;
  onLaunch(callback: (launch: Launch) => void): () => void;
}
declare global {
  interface Window {
    rpforge?: DesktopBridge;
  }
}
export const tools = [
  {id:'skin',title:'Separar pele',description:'Revise a seleção e gere a roupa e a pele em arquivos separados.',badge:'.ydd',category:'Roupas e geometria'},
  {id:'neon',title:'Roupas para Neon',description:'Crie uma versão emissiva da roupa isolada, preservando a malha e o rig.',badge:'.ydd',category:'Roupas e materiais'},
  {
    id: 'clothing',
    title: 'Roupas para OBJ',
    description: 'Exporte a peça com UVs e materiais para texturização.',
    badge: '.ydd → .obj',
    category: 'Roupas e texturização',
  },
  {
    id: "converter",
    title: "Converter RPFs",
    description: "Veículos, roupas e mapas organizados em recursos FiveM.",
    badge: ".rpf",
    category: "GTA V → FiveM",
  },
  {
    id: "ytyp",
    title: "Gerar YTYP",
    description:
      "Registre os modelos YDR da sua pasta sem alterar os originais.",
    badge: ".ydr",
    category: "Modelos e mapas",
  },
] as const;
