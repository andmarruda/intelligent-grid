// Deterministic sample data so every example looks the same on each load.
export function random(seed = 42) {
    let state = seed;
    return () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
    };
}

const rand = random();
const pick = list => list[Math.floor(rand() * list.length)];
const between = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const isoDay = offset => new Date(Date.UTC(2026, 0, 1 + offset)).toISOString().slice(0, 10);

export const PRODUCTS = ['Café', 'Chá', 'Bolo', 'Pão de queijo', 'Suco', 'Torta', 'Brigadeiro', 'Coxinha'];
export const CITIES = ['Ribeirão Preto', 'São Paulo', 'Curitiba', 'Belo Horizonte', 'Recife', 'Porto Alegre'];
export const STATUS = [
    { value: 'open', label: 'Open' },
    { value: 'shipped', label: 'Shipped' },
    { value: 'done', label: 'Done' }
];

export function orders(count = 200) {
    return Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        product: pick(PRODUCTS),
        city: pick(CITIES),
        qty: between(1, 20),
        price: between(300, 9000) / 100,
        discount: between(0, 3) * 0.05,
        due: isoDay(between(0, 330)),
        paid: rand() > 0.4,
        status: pick(STATUS).value
    }));
}

export function customers(count = 1000) {
    return Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        name: `Customer ${String(i + 1).padStart(4, '0')}`,
        city: pick(CITIES),
        score: between(0, 100),
        joined: isoDay(between(-900, 300))
    }));
}

export function logger(element) {
    return (...parts) => {
        const line = parts.map(p => typeof p === 'string' ? p : JSON.stringify(p)).join(' ');
        element.textContent = `${new Date().toLocaleTimeString()}  ${line}\n${element.textContent}`.slice(0, 5000);
    };
}
