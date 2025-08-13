import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GetFileResponse, GetFileNodesResponse, Transform, Vector, ComponentPropertyType, Node } from '@figma/rest-api-spec';
export { startServer } from './cli.js';

type ImageProcessingResult = {
    filePath: string;
    originalDimensions: {
        width: number;
        height: number;
    };
    finalDimensions: {
        width: number;
        height: number;
    };
    wasCropped: boolean;
    cropRegion?: {
        left: number;
        top: number;
        width: number;
        height: number;
    };
    cssVariables?: string;
    processingLog: string[];
};

type FigmaAuthOptions = {
    figmaApiKey: string;
    figmaOAuthToken: string;
    useOAuth: boolean;
};
type SvgOptions = {
    outlineText: boolean;
    includeId: boolean;
    simplifyStroke: boolean;
};
declare class FigmaService {
    private readonly apiKey;
    private readonly oauthToken;
    private readonly useOAuth;
    private readonly baseUrl;
    constructor({ figmaApiKey, figmaOAuthToken, useOAuth }: FigmaAuthOptions);
    private getAuthHeaders;
    private filterValidImages;
    private request;
    private buildSvgQueryParams;
    getImageFillUrls(fileKey: string): Promise<Record<string, string>>;
    getNodeRenderUrls(fileKey: string, nodeIds: string[], format: "png" | "svg", options?: {
        pngScale?: number;
        svgOptions?: SvgOptions;
    }): Promise<Record<string, string>>;
    downloadImages(fileKey: string, localPath: string, items: Array<{
        imageRef?: string;
        nodeId?: string;
        fileName: string;
        needsCropping?: boolean;
        cropTransform?: any;
        requiresImageDimensions?: boolean;
    }>, options?: {
        pngScale?: number;
        svgOptions?: SvgOptions;
    }): Promise<ImageProcessingResult[]>;
    getRawFile(fileKey: string, depth?: number | null): Promise<GetFileResponse>;
    getRawNode(fileKey: string, nodeId: string, depth?: number | null): Promise<GetFileNodesResponse>;
}

type CreateServerOptions = {
    isHTTP?: boolean;
    outputFormat?: "yaml" | "json";
    skipImageDownloads?: boolean;
};
declare function createServer(authOptions: FigmaAuthOptions, { isHTTP, outputFormat, skipImageDownloads }?: CreateServerOptions): McpServer;

type StyleId = `${string}_${string}` & {
    __brand: "StyleId";
};

type SimplifiedTextStyle = Partial<{
    fontFamily: string;
    fontWeight: number;
    fontSize: number;
    lineHeight: string;
    letterSpacing: string;
    textCase: string;
    textAlignHorizontal: string;
    textAlignVertical: string;
}>;

interface SimplifiedLayout {
    mode: "none" | "row" | "column";
    justifyContent?: "flex-start" | "flex-end" | "center" | "space-between" | "baseline" | "stretch";
    alignItems?: "flex-start" | "flex-end" | "center" | "space-between" | "baseline" | "stretch";
    alignSelf?: "flex-start" | "flex-end" | "center" | "stretch";
    wrap?: boolean;
    gap?: string;
    locationRelativeToParent?: {
        x: number;
        y: number;
    };
    dimensions?: {
        width?: number;
        height?: number;
        aspectRatio?: number;
    };
    padding?: string;
    sizing?: {
        horizontal?: "fixed" | "fill" | "hug";
        vertical?: "fixed" | "fill" | "hug";
    };
    overflowScroll?: ("x" | "y")[];
    position?: "absolute";
}

type CSSRGBAColor = `rgba(${number}, ${number}, ${number}, ${number})`;
type CSSHexColor = `#${string}`;
interface ColorValue {
    hex: CSSHexColor;
    opacity: number;
}
type SimplifiedImageFill = {
    type: "IMAGE";
    imageRef: string;
    scaleMode: "FILL" | "FIT" | "TILE" | "STRETCH";
    scalingFactor?: number;
    backgroundSize?: string;
    backgroundRepeat?: string;
    isBackground?: boolean;
    objectFit?: string;
    imageDownloadArguments?: {
        needsCropping: boolean;
        requiresImageDimensions: boolean;
        cropTransform?: Transform;
        filenameSuffix?: string;
    };
};
type SimplifiedGradientFill = {
    type: "GRADIENT_LINEAR" | "GRADIENT_RADIAL" | "GRADIENT_ANGULAR" | "GRADIENT_DIAMOND";
    gradientHandlePositions?: Vector[];
    gradientStops?: {
        position: number;
        color: ColorValue | string;
    }[];
};
type SimplifiedPatternFill = {
    type: "PATTERN";
    patternSource: {
        type: "IMAGE-PNG";
        nodeId: string;
    };
    backgroundRepeat: string;
    backgroundSize: string;
    backgroundPosition: string;
};
type SimplifiedFill = SimplifiedImageFill | SimplifiedGradientFill | SimplifiedPatternFill | CSSRGBAColor | CSSHexColor;
type SimplifiedStroke = {
    colors: SimplifiedFill[];
    strokeWeight?: string;
    strokeDashes?: number[];
    strokeWeights?: string;
};

type SimplifiedEffects = {
    boxShadow?: string;
    filter?: string;
    backdropFilter?: string;
    textShadow?: string;
};

interface ComponentProperties {
    name: string;
    value: string;
    type: ComponentPropertyType;
}
interface SimplifiedComponentDefinition {
    id: string;
    key: string;
    name: string;
    componentSetId?: string;
}
interface SimplifiedComponentSetDefinition {
    id: string;
    key: string;
    name: string;
    description?: string;
}

type StyleTypes = SimplifiedTextStyle | SimplifiedFill[] | SimplifiedLayout | SimplifiedStroke | SimplifiedEffects | string;
type GlobalVars = {
    styles: Record<StyleId, StyleTypes>;
};
interface TraversalContext {
    globalVars: GlobalVars;
    currentDepth: number;
    parent?: Node;
}
interface TraversalOptions {
    maxDepth?: number;
    nodeFilter?: (node: Node) => boolean;
}
type ExtractorFn = (node: Node, result: SimplifiedNode, context: TraversalContext) => void;
interface SimplifiedDesign {
    name: string;
    lastModified: string;
    thumbnailUrl: string;
    nodes: SimplifiedNode[];
    components: Record<string, SimplifiedComponentDefinition>;
    componentSets: Record<string, SimplifiedComponentSetDefinition>;
    globalVars: GlobalVars;
}
interface SimplifiedNode {
    id: string;
    name: string;
    type: string;
    text?: string;
    textStyle?: string;
    fills?: string;
    styles?: string;
    strokes?: string;
    effects?: string;
    opacity?: number;
    borderRadius?: string;
    layout?: string;
    componentId?: string;
    componentProperties?: ComponentProperties[];
    children?: SimplifiedNode[];
}

interface ServerConfig {
    auth: FigmaAuthOptions;
    port: number;
    outputFormat: "yaml" | "json";
    skipImageDownloads?: boolean;
    configSources: {
        figmaApiKey: "cli" | "env";
        figmaOAuthToken: "cli" | "env" | "none";
        port: "cli" | "env" | "default";
        outputFormat: "cli" | "env" | "default";
        envFile: "cli" | "default";
        skipImageDownloads?: "cli" | "env" | "default";
    };
}
declare function getServerConfig(isStdioMode: boolean): ServerConfig;

declare function extractFromDesign(nodes: Node[], extractors: ExtractorFn[], options?: TraversalOptions, globalVars?: GlobalVars): {
    nodes: SimplifiedNode[];
    globalVars: GlobalVars;
};

declare function simplifyRawFigmaObject(apiResponse: GetFileResponse | GetFileNodesResponse, nodeExtractors: ExtractorFn[], options?: TraversalOptions): SimplifiedDesign;

declare const layoutExtractor: ExtractorFn;
declare const textExtractor: ExtractorFn;
declare const visualsExtractor: ExtractorFn;
declare const componentExtractor: ExtractorFn;
declare const allExtractors: ExtractorFn[];
declare const layoutAndText: ExtractorFn[];
declare const contentOnly: ExtractorFn[];
declare const visualsOnly: ExtractorFn[];
declare const layoutOnly: ExtractorFn[];

export { type ExtractorFn, FigmaService, type GlobalVars, type SimplifiedDesign, type StyleTypes, type TraversalContext, type TraversalOptions, allExtractors, componentExtractor, contentOnly, createServer, extractFromDesign, getServerConfig, layoutAndText, layoutExtractor, layoutOnly, simplifyRawFigmaObject, textExtractor, visualsExtractor, visualsOnly };
