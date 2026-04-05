export function normalizeInstructionForDisplay(input: string): string {
    return input
        .replace(/\r\n?/g, "\n")
        .replace(/[\u2013\u2014]/g, "-")
        .split("\n")
        .map((line) => {
            let next = line
                .replace(/\u00a0/g, " ")
                .replace(/[\t]+/g, "    ")
                .replace(/[ \t]+$/g, "");

            // Many PDF exports use private-use glyphs for bullets; normalize them.
            next = next.replace(/^[\uE000-\uF8FF]\s*/, "• ");
            next = next.replace(/^[□▪◦·]\s*/, "• ");

            return next;
        })
        .join("\n");
}

export type InstructionSections = {
    generalInstructions: string;
    markingScheme: string;
};

function isGeneralHeading(line: string) {
    return /^\s*general\s+instructions\s*:?\s*$/i.test(line);
}

function isMarkingHeading(line: string) {
    return /^\s*marking\s+scheme\s*:?\s*$/i.test(line);
}

export function splitInstructionSections(input: string | null | undefined): InstructionSections {
    const raw = (input ?? "").replace(/\r\n?/g, "\n");
    if (!raw.trim()) {
        return { generalInstructions: "", markingScheme: "" };
    }

    const lines = raw.split("\n");
    const general: string[] = [];
    const marking: string[] = [];
    let section: "general" | "marking" = "general";

    for (const line of lines) {
        if (isGeneralHeading(line)) {
            section = "general";
            continue;
        }
        if (isMarkingHeading(line)) {
            section = "marking";
            continue;
        }

        if (section === "marking") {
            marking.push(line);
        } else {
            general.push(line);
        }
    }

    return {
        generalInstructions: general.join("\n").trim(),
        markingScheme: marking.join("\n").trim(),
    };
}

export function composeInstructionSections(parts: InstructionSections): string {
    const general = (parts.generalInstructions ?? "").trim();
    const marking = (parts.markingScheme ?? "").trim();

    const out: string[] = [];
    if (general) {
        out.push(`GENERAL INSTRUCTIONS\n${general}`);
    }
    if (marking) {
        out.push(`MARKING SCHEME\n${marking}`);
    }

    return out.join("\n\n").trim();
}
