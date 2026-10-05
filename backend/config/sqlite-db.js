const sqlite = require("./sqlite");

function normalizeParams(params = []) {
    return params.map((value) => {
        if (value instanceof Date) {
            return value.toISOString().slice(0, 19).replace("T", " ");
        }

        if (value === undefined) {
            return null;
        }

        return value;
    });
}

async function query(sql, params = []) {
    const trimmed = sql.trim().toUpperCase();
    const normalizedParams = normalizeParams(params);

    // SELECT
    if (trimmed.startsWith("SELECT")) {
        const rows = sqlite.prepare(sql).all(...normalizedParams);
        return [rows, []];
    }

    // INSERT
    if (trimmed.startsWith("INSERT")) {
        const result = sqlite.prepare(sql).run(...normalizedParams);

        return [
            {
                insertId: Number(result.lastInsertRowid),
                affectedRows: result.changes
            },
            []
        ];
    }

    // UPDATE / DELETE
    if (
        trimmed.startsWith("UPDATE") ||
        trimmed.startsWith("DELETE")
    ) {
        const result = sqlite.prepare(sql).run(...normalizedParams);

        return [
            {
                affectedRows: result.changes
            },
            []
        ];
    }

    // Other statements
    const result = sqlite.prepare(sql).run(...normalizedParams);

    return [
        {
            affectedRows: result.changes || 0
        },
        []
    ];
}

module.exports = {
    query,
    sqlite
};

