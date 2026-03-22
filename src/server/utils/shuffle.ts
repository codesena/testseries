export function shuffleInPlace<T>(items: T[], random = Math.random): T[] {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
}

export function shuffled<T>(items: readonly T[], random = Math.random): T[] {
    return shuffleInPlace([...items], random);
}
