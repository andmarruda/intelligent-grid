// Types of the sample data module, for the demo backend (scripts/demo-api.ts)
export interface Order {
    id: number;
    product: string;
    city: string;
    qty: number;
    price: number;
    discount: number;
    due: string;
    paid: boolean;
    status: string;
}
export declare function orders(count?: number): Order[];
export declare function customers(count?: number): Array<{ id: number; name: string; city: string; score: number; joined: string }>;
export declare const STATUS: Array<{ value: string; label: string }>;
export declare const PRODUCTS: string[];
export declare const CITIES: string[];
export declare function random(seed?: number): () => number;
export declare function logger(element: Element): (...parts: unknown[]) => void;
