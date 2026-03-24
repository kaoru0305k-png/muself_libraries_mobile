const state = {
    library: [],
    currentTab: "all",
    currentPage: 1,
    currentSort: "added",
    itemsPerPage: 20,
    editingWork: null,
    filteredLibrary: null,
    isHtmlPanelOpen: false,
    pendingJsonImportMode: "merge"
};

const els = {
    htmlInput: document.getElementById("htmlInput"),
    autoFormatCheck: document.getElementById("autoFormatCheck"),
    htmlPanel: document.getElementById("htmlPanel"),
    toggleHtmlPanelBtn: document.getElementById("toggleHtmlPanelBtn"),

    statusBar: document.getElementById("statusBar"),
    emptyState: document.getElementById("emptyState"),
    jsonPreview: document.getElementById("jsonPreview"),
    library: document.getElementById("library"),
    pagination: document.getElementById("pagination"),
    searchBox: document.getElementById("searchBox"),
    searchChips: document.getElementById("searchChips"),
    itemsPerPageInfo: document.getElementById("itemsPerPageInfo"),

    sortSelect: document.getElementById("sortSelect"),
    itemsPerPageSelect: document.getElementById("itemsPerPageSelect"),
    jsonFileInput: document.getElementById("jsonFileInput"),

    formatBtn: document.getElementById("formatBtn"),
    importBtn: document.getElementById("importBtn"),
    exportJsonBtn: document.getElementById("exportJsonBtn"),
    importJsonMergeBtn: document.getElementById("importJsonMergeBtn"),
    importJsonReplaceBtn: document.getElementById("importJsonReplaceBtn"),
    clearBtn: document.getElementById("clearBtn"),
    resetFavBtn: document.getElementById("resetFavBtn"),
    allTabBtn: document.getElementById("allTabBtn"),
    favTabBtn: document.getElementById("favTabBtn"),
    circleTabBtn: document.getElementById("circleTabBtn"),

    editModal: document.getElementById("editModal"),
    editTitleInput: document.getElementById("editTitleInput"),
    editCircleInput: document.getElementById("editCircleInput"),
    editUrlInput: document.getElementById("editUrlInput"),
    editThumbInput: document.getElementById("editThumbInput"),
    editTagsInput: document.getElementById("editTagsInput"),
    editFavoriteInput: document.getElementById("editFavoriteInput"),
    saveEditBtn: document.getElementById("saveEditBtn"),
    cancelEditBtn: document.getElementById("cancelEditBtn"),
    closeEditBtn: document.getElementById("closeEditBtn")
};

const repository = {
    async load() {
        const raw = localStorage.getItem("fvl_mobile_library");
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    },

    async save(items) {
        localStorage.setItem("fvl_mobile_library", JSON.stringify(items));
    }
};

const service = {
    normalizeText(value) {
        return String(value || "")
            .normalize("NFKC")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
    },

    normalizeUrl(rawUrl) {
        if (!rawUrl) return "";

        try {
            const url = new URL(rawUrl, "https://www.dmm.co.jp");
            url.hash = "";

            const paramsToKeep = ["cid", "i3_ref", "dmmref"];
            const nextParams = new URLSearchParams();

            paramsToKeep.forEach((key) => {
                if (url.searchParams.has(key)) {
                    nextParams.set(key, url.searchParams.get(key));
                }
            });

            url.search = nextParams.toString() ? `?${nextParams.toString()}` : "";
            return url.href.replace(/\/+$/, "");
        } catch {
            return String(rawUrl).trim();
        }
    },

    extractProductIdFromUrl(rawUrl) {
        const url = this.normalizeUrl(rawUrl);
        if (!url) return "";

        try {
            const parsed = new URL(url);

            const cid = parsed.searchParams.get("cid");
            if (cid && /^[a-z0-9_%-]+$/i.test(cid)) {
                return cid.trim().toLowerCase();
            }

            const path = parsed.pathname || "";

            const productIdMatch = path.match(/\/product_id=([^/]+)/i);
            if (productIdMatch?.[1]) {
                return productIdMatch[1].trim().toLowerCase();
            }

            const detailMatch = path.match(/\/detail\/([^/?#]+)/i);
            if (detailMatch?.[1]) {
                return detailMatch[1].trim().toLowerCase();
            }
        } catch { }

        return "";
    },

    normalizeStoredWork(item, index = 0) {
        const url = this.normalizeUrl(item?.url || "");
        return {
            title: item?.title || "Untitled",
            url,
            thumb: item?.thumb || "",
            tags: Array.isArray(item?.tags)
                ? [...new Set(item.tags.map((tag) => String(tag).trim()).filter(Boolean))]
                : [],
            added: Number.isFinite(item?.added) ? item.added : Date.now(),
            order: Number.isFinite(item?.order) ? item.order : index,
            circle: item?.circle || "",
            favorite: !!item?.favorite,
            productId: item?.productId || this.extractProductIdFromUrl(url)
        };
    },

    buildIdentity(work) {
        return {
            normalizedUrl: this.normalizeUrl(work.url || ""),
            productId: work.productId || this.extractProductIdFromUrl(work.url || ""),
            normalizedTitle: this.normalizeText(work.title || ""),
            normalizedCircle: this.normalizeText(work.circle || "")
        };
    },

    buildBatchKey(work) {
        const id = this.buildIdentity(work);
        return id.normalizedUrl || id.productId || `${id.normalizedTitle}__${id.normalizedCircle}`;
    },

    isDuplicateWork(candidate, library) {
        const a = this.buildIdentity(candidate);

        return library.some((existing) => {
            const b = this.buildIdentity(existing);

            if (a.normalizedUrl && b.normalizedUrl && a.normalizedUrl === b.normalizedUrl) {
                return true;
            }

            if (a.productId && b.productId && a.productId === b.productId) {
                return true;
            }

            const canUseTitleCircle =
                a.normalizedTitle.length >= 4 &&
                b.normalizedTitle.length >= 4 &&
                a.normalizedCircle &&
                b.normalizedCircle;

            return canUseTitleCircle &&
                a.normalizedTitle === b.normalizedTitle &&
                a.normalizedCircle === b.normalizedCircle;
        });
    },

    mergeUniqueTags(...tagLists) {
        return [...new Set(
            tagLists.flat().map((tag) => String(tag || "").trim()).filter(Boolean)
        )];
    },

    hasVoiceCategory(item) {
        const categoryText = String(item?.category || "");
        if (categoryText.includes("ボイス")) return true;

        const tags = Array.isArray(item?.tags) ? item.tags : [];
        return tags.some((tag) => String(tag || "").includes("ボイス"));
    },

    getNextOrder(library) {
        if (!library.length) return 0;
        return Math.max(...library.map((work) => Number.isFinite(work.order) ? work.order : -1)) + 1;
    },

    formatHTML(html) {
        if (!String(html || "").trim()) return "";

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const voidTags = new Set(["img", "br", "hr", "input", "meta", "link"]);

        function escapeAttr(value) {
            return String(value).replace(/"/g, "&quot;");
        }

        function pretty(node, depth = 0) {
            let result = "";
            const indent = "  ".repeat(depth);

            node.childNodes.forEach((child) => {
                if (child.nodeType === Node.TEXT_NODE) {
                    const text = child.textContent.trim();
                    if (text) result += `${indent}${text}\n`;
                    return;
                }

                if (child.nodeType !== Node.ELEMENT_NODE) return;

                const tag = child.tagName.toLowerCase();
                result += `${indent}<${tag}`;

                Array.from(child.attributes).forEach((attr) => {
                    result += ` ${attr.name}="${escapeAttr(attr.value)}"`;
                });

                if (voidTags.has(tag)) {
                    result += ">\n";
                    return;
                }

                result += ">\n";
                result += pretty(child, depth + 1);
                result += `${indent}</${tag}>\n`;
            });

            return result;
        }

        return pretty(doc.body);
    },

    getImportLinkCandidates(doc) {
        const selectors = [
            'a[href*="/mylibrary/detail/"]',
            'a[href*="/digital/-/detail/"]',
            'a[href*="/detail/"]'
        ];

        const results = [];
        const seen = new Set();

        selectors.forEach((selector) => {
            doc.querySelectorAll(selector).forEach((link) => {
                const href = link.getAttribute("href") || "";
                const key = this.normalizeUrl(href) || href.trim();
                if (!key || seen.has(key)) return;
                seen.add(key);
                results.push(link);
            });
        });

        return results;
    },

    extractWorkFromAnchor(anchor, order) {
        const img = anchor.querySelector("img");
        if (!img) return null;

        let url = "";
        try {
            url = this.normalizeUrl(new URL(anchor.getAttribute("href"), "https://www.dmm.co.jp").href);
        } catch {
            return null;
        }

        const paragraphs = Array.from(anchor.querySelectorAll("p"))
            .map((el) => el.textContent?.trim())
            .filter(Boolean);

        const spans = Array.from(anchor.querySelectorAll("span"))
            .map((el) => el.textContent?.trim())
            .filter(Boolean);

        const titleByRole = anchor.querySelector('[data-fvl-role="title"]')?.textContent?.trim() || "";
        const circleByRole = anchor.querySelector('[data-fvl-role="circle"]')?.textContent?.trim() || "";
        const categoryByRole = anchor.querySelector('[data-fvl-role="category"]')?.textContent?.trim() || "";

        const title =
            titleByRole ||
            paragraphs[0] ||
            img.alt?.trim() ||
            anchor.textContent.trim() ||
            "Untitled";

        const circle = circleByRole || paragraphs[1] || "";
        const category = categoryByRole || spans[0] || "";
        const thumb =
            img.getAttribute("src") ||
            img.getAttribute("data-src") ||
            img.getAttribute("data-original") ||
            img.currentSrc ||
            img.src ||
            "";

        return this.normalizeStoredWork({
            title,
            url,
            thumb,
            tags: category ? [category] : [],
            added: Date.now(),
            order,
            circle,
            favorite: false,
            productId: this.extractProductIdFromUrl(url)
        }, order);
    },

    syncImportedItemsOrder(library, items, options = {}) {
        const {
            requireVoiceCategory = true
        } = options;

        const nextLibrary = [...library];
        const seenInBatch = new Set();
        const matchedWorksInOrder = [];
        const usedExisting = new Set();

        const result = {
            library: nextLibrary,
            addedCount: 0,
            duplicateCount: 0,
            updatedCount: 0,
            skippedCount: 0
        };

        items.forEach((rawItem) => {
            if (!rawItem || typeof rawItem !== "object") {
                result.skippedCount++;
                return;
            }

            if (requireVoiceCategory && !this.hasVoiceCategory(rawItem)) {
                result.skippedCount++;
                return;
            }

            const candidate = this.normalizeStoredWork(rawItem, 0);
            const batchKey = this.buildBatchKey(candidate);

            if (batchKey && seenInBatch.has(batchKey)) {
                result.duplicateCount++;
                return;
            }
            if (batchKey) {
                seenInBatch.add(batchKey);
            }

            const existing = nextLibrary.find((work) => {
                if (usedExisting.has(work)) return false;
                return this.isDuplicateWork(candidate, [work]);
            });

            if (existing) {
                usedExisting.add(existing);
                result.duplicateCount++;
                matchedWorksInOrder.push(existing);
                return;
            }

            const newWork = this.normalizeStoredWork({
                ...candidate,
                added: Date.now(),
                favorite: !!candidate.favorite
            }, 0);

            nextLibrary.push(newWork);
            matchedWorksInOrder.push(newWork);
            result.addedCount++;
        });

        const remaining = nextLibrary.filter((work) => !matchedWorksInOrder.includes(work));
        const reordered = [...matchedWorksInOrder, ...remaining];

        reordered.forEach((work, index) => {
            work.order = index;
        });

        result.library = reordered;
        return result;
    },

    parseSearchQuery(query) {
        const groups = String(query || "")
            .split("|")
            .map((group) => group.trim())
            .filter(Boolean);

        return groups.map((group) => {
            const tokens = group.split(/\s+/).filter(Boolean);
            return {
                include: tokens.filter((token) => !token.startsWith("-")),
                exclude: tokens.filter((token) => token.startsWith("-")).map((token) => token.slice(1))
            };
        });
    },

    filterBySearch(items, query) {
        const normalized = String(query || "").trim().toLowerCase();
        const parsed = this.parseSearchQuery(normalized);
        if (parsed.length === 0) return null;

        return items.filter((work) => {
            const searchableText = [
                work.title || "",
                work.circle || "",
                work.url || "",
                work.productId || "",
                ...(Array.isArray(work.tags) ? work.tags : [])
            ].join(" ").toLowerCase();

            return parsed.some((group) => {
                const includeOK = group.include.every((keyword) => searchableText.includes(keyword));
                const excludeOK = group.exclude.every((keyword) => !searchableText.includes(keyword));
                return includeOK && excludeOK;
            });
        });
    },

    sort(items, sortKey) {
        const sorted = [...items];

        if (sortKey === "title") {
            sorted.sort((a, b) =>
                (a.title || "").localeCompare(b.title || "", "ja", { numeric: true, sensitivity: "base" })
            );
            return sorted;
        }

        if (sortKey === "circle") {
            sorted.sort((a, b) => {
                const circleCompare = (a.circle || "").localeCompare(b.circle || "", "ja", { numeric: true, sensitivity: "base" });
                if (circleCompare !== 0) return circleCompare;
                return (a.title || "").localeCompare(b.title || "", "ja", { numeric: true, sensitivity: "base" });
            });
            return sorted;
        }

        sorted.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        return sorted;
    },

    paginate(items, currentPage, itemsPerPage) {
        const totalCount = items.length;
        const isAllMode = itemsPerPage === "all";
        const totalPages = isAllMode ? 1 : Math.max(1, Math.ceil(totalCount / itemsPerPage));
        const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);
        const start = isAllMode ? 0 : (safeCurrentPage - 1) * itemsPerPage;
        const end = isAllMode ? totalCount : start + itemsPerPage;

        return {
            isAllMode,
            totalCount,
            totalPages,
            currentPage: safeCurrentPage,
            visibleCount: totalCount === 0 ? 0 : Math.max(Math.min(end, totalCount) - start, 0),
            pageItems: items.slice(start, end)
        };
    },

    getCircleMap(items) {
        const map = {};
        items.forEach((work) => {
            const circleName = work.circle || "未分類";
            if (!map[circleName]) map[circleName] = [];
            map[circleName].push(work);
        });
        return map;
    },

    getCircleLatestCards(items) {
        const circleMap = this.getCircleMap(items);
        const circles = Object.keys(circleMap).sort((a, b) =>
            a.localeCompare(b, "ja", { numeric: true, sensitivity: "base" })
        );

        return circles.map((circleName) => {
            const works = circleMap[circleName];
            const latestWork = works.reduce((prev, curr) => {
                const prevAdded = prev.added || 0;
                const currAdded = curr.added || 0;
                if (currAdded > prevAdded) return curr;
                if (currAdded === prevAdded && (curr.order || 0) > (prev.order || 0)) return curr;
                return prev;
            }, works[0]);

            return { circleName, latestWork, count: works.length };
        });
    },

    parseJsonPayload(text) {
        let parsed;

        try {
            parsed = JSON.parse(text);
        } catch {
            return {
                ok: false,
                error: "JSONの解析に失敗しました"
            };
        }

        const items = Array.isArray(parsed) ? parsed : parsed?.items;
        if (!Array.isArray(items)) {
            return {
                ok: false,
                error: "有効なライブラリJSONではありません"
            };
        }

        return {
            ok: true,
            payload: parsed,
            items
        };
    },

    summarizeJsonPayload(payload, items) {
        const app = payload?.app || "不明";
        const version = payload?.version ?? "不明";
        const exportedAt = payload?.exportedAt || "不明";

        return `JSON確認: ${items.length}件 / app=${app} / version=${version} / exportedAt=${exportedAt}`;
    }
};

const ui = {
    setStatus(message, type = "info") {
        els.statusBar.textContent = message || "";
        els.statusBar.dataset.type = type;
    },

    showEmpty(message) {
        els.emptyState.textContent = message || "";
        els.emptyState.hidden = false;
    },

    hideEmpty() {
        els.emptyState.hidden = true;
        els.emptyState.textContent = "";
    },

    showJsonPreview(message) {
        els.jsonPreview.textContent = message || "";
        els.jsonPreview.hidden = false;
    },

    hideJsonPreview() {
        els.jsonPreview.textContent = "";
        els.jsonPreview.hidden = true;
    },

    updateTabs() {
        els.allTabBtn.classList.toggle("active", state.currentTab === "all");
        els.favTabBtn.classList.toggle("active", state.currentTab === "favorite");
        els.circleTabBtn.classList.toggle("active", state.currentTab === "circle");
    },

    updateHtmlPanel() {
        els.htmlPanel.hidden = !state.isHtmlPanelOpen;
        els.toggleHtmlPanelBtn.textContent = state.isHtmlPanelOpen
            ? "HTML入力を閉じる"
            : "HTML入力を開く";
    },

    renderSearchChips(query) {
        els.searchChips.innerHTML = "";
        const raw = String(query || "").trim();
        if (!raw) return;

        const parts = raw.match(/\||[^\s|]+/g) || [];
        parts.forEach((part, index) => {
            const chip = document.createElement("span");
            chip.className = "chip";
            chip.textContent = part;
            chip.addEventListener("click", () => {
                const nextParts = parts.filter((_, i) => i !== index);
                els.searchBox.value = nextParts.join(" ").replace(/\s+\|\s+/g, " | ").trim();
                controller.handleSearch();
            });
            els.searchChips.appendChild(chip);
        });
    }
};

const selector = {
    getActiveBaseList() {
        return state.filteredLibrary || state.library;
    },

    getCurrentListForInfo() {
        if (state.currentTab === "favorite") {
            return service.sort(this.getActiveBaseList().filter((work) => work.favorite), state.currentSort);
        }
        if (state.currentTab === "circle") {
            return service.getCircleLatestCards(this.getActiveBaseList());
        }
        return service.sort(this.getActiveBaseList(), state.currentSort);
    }
};

async function commitLibrary(items, { resetPage = false, syncSearch = true } = {}) {
    state.library = items;

    if (syncSearch) {
        controller.syncSearchState();
    }

    if (resetPage) {
        state.currentPage = 1;
    }

    await repository.save(state.library);
    controller.refreshView();
}

const renderer = {
    clearRenderTargets() {
        els.library.innerHTML = "";
        els.pagination.innerHTML = "";
    },

    updateItemsPerPageInfo(context = null) {
        if (context?.mode === "circle-detail") {
            const isAllMode = state.itemsPerPage === "all";
            els.itemsPerPageInfo.textContent = isAllMode
                ? `${context.circleName} : ${context.totalCount} / ${context.totalCount}件（全件）`
                : `${context.circleName} : ${context.visibleCount} / ${context.totalCount}件`;
            return;
        }

        if (context?.mode === "circle-top") {
            const isAllMode = state.itemsPerPage === "all";
            els.itemsPerPageInfo.textContent = isAllMode
                ? `サークル数: ${context.totalCount} / ${context.totalCount}件（全件）`
                : `サークル数: ${context.visibleCount} / ${context.totalCount}件`;
            return;
        }

        const currentList = selector.getCurrentListForInfo();
        const page = service.paginate(currentList, state.currentPage, state.itemsPerPage);

        els.itemsPerPageInfo.textContent = page.isAllMode
            ? `表示中: ${page.totalCount} / ${page.totalCount}件（全件）`
            : `表示中: ${page.visibleCount} / ${page.totalCount}件`;
    },

    renderPagination(totalPages, activePage, onClickPage) {
        els.pagination.innerHTML = "";
        if (state.itemsPerPage === "all" || totalPages <= 1) return;

        const visibleRange = 2;
        const startPage = Math.max(1, activePage - visibleRange);
        const endPage = Math.min(totalPages, activePage + visibleRange);

        const createPageButton = (label, page, options = {}) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = label;

            if (options.disabled) {
                btn.disabled = true;
            } else if (options.isActive) {
                btn.disabled = true;
            } else {
                btn.addEventListener("click", () => onClickPage(page));
            }

            els.pagination.appendChild(btn);
        };

        const createEllipsis = () => {
            const span = document.createElement("span");
            span.className = "pagination-ellipsis";
            span.textContent = "...";
            els.pagination.appendChild(span);
        };

        const createInfo = () => {
            const span = document.createElement("span");
            span.className = "pagination-info";
            span.textContent = `${activePage} / ${totalPages}`;
            els.pagination.appendChild(span);
        };

        createPageButton("最初", 1, { disabled: activePage === 1 });
        createPageButton("‹ 前へ", activePage - 1, { disabled: activePage === 1 });

        if (startPage > 1) createPageButton("1", 1, { isActive: activePage === 1 });
        if (startPage > 2) createEllipsis();

        for (let i = startPage; i <= endPage; i++) {
            createPageButton(String(i), i, { isActive: i === activePage });
        }

        if (endPage < totalPages - 1) createEllipsis();
        if (endPage < totalPages) createPageButton(String(totalPages), totalPages, { isActive: activePage === totalPages });

        createInfo();

        createPageButton("次へ ›", activePage + 1, { disabled: activePage === totalPages });
        createPageButton("最後", totalPages, { disabled: activePage === totalPages });
    },

    createTagElement(work, tag) {
        const tagEl = document.createElement("span");
        tagEl.className = "tag";
        tagEl.textContent = tag;

        tagEl.addEventListener("click", () => {
            const current = els.searchBox.value.trim();
            els.searchBox.value = current ? `${current} ${tag}` : tag;
            controller.handleSearch();
        });

        tagEl.addEventListener("contextmenu", async (e) => {
            e.preventDefault();
            await controller.handleRemoveTag(work, tag);
        });

        return tagEl;
    },

    createTagInput(work) {
        const input = document.createElement("input");
        input.className = "tag-input";
        input.placeholder = "+tag";

        input.addEventListener("keydown", async (e) => {
            if (e.key !== "Enter") return;
            const newTag = input.value.trim();
            input.value = "";
            await controller.handleAddTag(work, newTag);
        });

        return input;
    },

    createWorkCard(work) {
        const card = document.createElement("div");
        card.className = "card";

        const link = document.createElement("a");
        link.href = work.url || "#";
        link.target = "_blank";
        link.rel = "noopener noreferrer";

        const img = document.createElement("img");
        img.src = work.thumb || "";
        img.alt = work.title || "thumbnail";

        const title = document.createElement("div");
        title.className = "title";
        title.textContent = work.title || "Untitled";

        const meta = document.createElement("div");
        meta.className = "meta";
        meta.textContent = work.circle || "未分類";

        const tagWrap = document.createElement("div");
        tagWrap.className = "tag-wrap";
        (work.tags || []).forEach((tag) => tagWrap.appendChild(this.createTagElement(work, tag)));

        const actions = document.createElement("div");
        actions.className = "card-actions";

        const favBtn = document.createElement("button");
        favBtn.className = "favorite-btn";
        favBtn.textContent = work.favorite ? "★" : "☆";
        favBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            await controller.handleToggleFavorite(work);
        });

        const editBtn = document.createElement("button");
        editBtn.className = "edit-btn";
        editBtn.textContent = "編集";
        editBtn.addEventListener("click", (e) => {
            e.preventDefault();
            controller.openEdit(work);
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "delete-btn";
        deleteBtn.textContent = "削除";
        deleteBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            await controller.handleDeleteWork(work);
        });

        actions.appendChild(favBtn);
        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);

        link.appendChild(img);
        card.appendChild(link);
        card.appendChild(title);
        card.appendChild(meta);
        card.appendChild(tagWrap);
        card.appendChild(this.createTagInput(work));
        card.appendChild(actions);

        return card;
    },

    appendCards(cards) {
        const frag = document.createDocumentFragment();
        cards.forEach((card) => frag.appendChild(card));
        els.library.appendChild(frag);
    },

    openEditModal(work) {
        state.editingWork = work;
        els.editTitleInput.value = work.title || "";
        els.editCircleInput.value = work.circle || "";
        els.editUrlInput.value = work.url || "";
        els.editThumbInput.value = work.thumb || "";
        els.editTagsInput.value = Array.isArray(work.tags) ? work.tags.join(" ") : "";
        els.editFavoriteInput.checked = !!work.favorite;
        els.editModal.hidden = false;

        setTimeout(() => {
            els.editTitleInput.focus();
        }, 0);
    },

    closeEditModal() {
        state.editingWork = null;
        els.editModal.hidden = true;
    }
};

const controller = {
    async loadLibrary() {
        const stored = await repository.load();
        const nextLibrary = [];

        stored.forEach((item, index) => {
            const normalized = service.normalizeStoredWork(item, index);
            if (!service.isDuplicateWork(normalized, nextLibrary)) {
                nextLibrary.push(normalized);
            }
        });

        state.library = nextLibrary;
        this.refreshView();
        ui.updateTabs();
        ui.setStatus(`${state.library.length} 件読み込み済み`, "info");
    },

    syncSearchState() {
        const searchValue = els.searchBox.value.trim();
        if (searchValue) {
            state.filteredLibrary = service.filterBySearch(state.library, searchValue);
            ui.renderSearchChips(searchValue);
        } else {
            state.filteredLibrary = null;
            ui.renderSearchChips("");
        }
    },

    handleSearch() {
        this.syncSearchState();
        state.currentPage = 1;
        this.refreshView();
    },

    refreshView() {
        if (state.currentTab === "circle") {
            this.renderCircleTop();
            return;
        }

        const base = selector.getActiveBaseList();
        const list = state.currentTab === "favorite"
            ? base.filter((work) => work.favorite)
            : base;

        const sorted = service.sort(list, state.currentSort);
        const page = service.paginate(sorted, state.currentPage, state.itemsPerPage);
        state.currentPage = page.currentPage;

        renderer.clearRenderTargets();

        if (page.totalCount === 0) {
            ui.showEmpty(
                state.filteredLibrary
                    ? "検索結果がありません。"
                    : state.currentTab === "favorite"
                        ? "お気に入り作品はありません。"
                        : "ライブラリは空です。HTML貼り付けまたはJSON読み込みを使ってください。"
            );
            renderer.updateItemsPerPageInfo();
            return;
        }

        ui.hideEmpty();
        renderer.appendCards(page.pageItems.map((work) => renderer.createWorkCard(work)));
        renderer.renderPagination(page.totalPages, page.currentPage, (nextPage) => {
            state.currentPage = nextPage;
            this.refreshView();
        });
        renderer.updateItemsPerPageInfo();
    },

    renderCircleTop() {
        const cards = service.getCircleLatestCards(selector.getActiveBaseList());
        const page = service.paginate(cards, state.currentPage, state.itemsPerPage);
        state.currentPage = page.currentPage;

        renderer.clearRenderTargets();

        if (page.totalCount === 0) {
            ui.showEmpty(state.filteredLibrary ? "検索条件に一致するサークルがありません。" : "サークル別に表示できる作品がありません。");
            renderer.updateItemsPerPageInfo({
                mode: "circle-top",
                totalCount: 0,
                visibleCount: 0
            });
            return;
        }

        ui.hideEmpty();

        const frag = document.createDocumentFragment();

        page.pageItems.forEach(({ circleName, latestWork, count }) => {
            const card = document.createElement("div");
            card.className = "card card-button";
            card.addEventListener("click", () => {
                state.currentPage = 1;
                this.renderCircleDetail(circleName);
            });

            const link = document.createElement("a");
            link.href = "#";
            link.addEventListener("click", (e) => {
                e.preventDefault();
            });

            const img = document.createElement("img");
            img.src = latestWork.thumb || "";
            img.alt = latestWork.title || circleName;

            const title = document.createElement("div");
            title.className = "title";
            title.textContent = `${circleName} (${count})`;

            link.appendChild(img);
            card.appendChild(link);
            card.appendChild(title);
            frag.appendChild(card);
        });

        els.library.appendChild(frag);

        renderer.renderPagination(page.totalPages, page.currentPage, (nextPage) => {
            state.currentPage = nextPage;
            this.renderCircleTop();
        });

        renderer.updateItemsPerPageInfo({
            mode: "circle-top",
            totalCount: page.totalCount,
            visibleCount: page.visibleCount
        });
    },

    renderCircleDetail(circleName) {
        const works = service.sort(
            selector.getActiveBaseList().filter((work) => (work.circle || "未分類") === circleName),
            state.currentSort
        );

        const page = service.paginate(works, state.currentPage, state.itemsPerPage);
        state.currentPage = page.currentPage;

        renderer.clearRenderTargets();
        ui.hideEmpty();

        const heading = document.createElement("h2");
        heading.className = "section-heading";
        heading.textContent = `${circleName} の全作品`;
        els.library.appendChild(heading);

        renderer.appendCards(page.pageItems.map((work) => renderer.createWorkCard(work)));

        const backWrap = document.createElement("div");
        backWrap.className = "back-button-wrap";

        const backBtn = document.createElement("button");
        backBtn.textContent = "← サークル別一覧に戻る";
        backBtn.addEventListener("click", () => {
            state.currentPage = 1;
            this.refreshView();
        });

        backWrap.appendChild(backBtn);
        els.library.appendChild(backWrap);

        renderer.renderPagination(page.totalPages, page.currentPage, (nextPage) => {
            state.currentPage = nextPage;
            this.renderCircleDetail(circleName);
        });

        renderer.updateItemsPerPageInfo({
            mode: "circle-detail",
            circleName,
            totalCount: page.totalCount,
            visibleCount: page.visibleCount
        });
    },

    openEdit(work) {
        renderer.openEditModal(work);
    },

    closeEdit() {
        renderer.closeEditModal();
    },

    async saveEdit() {
        if (!state.editingWork) return;

        const updated = {
            ...state.editingWork,
            title: els.editTitleInput.value.trim() || "Untitled",
            circle: els.editCircleInput.value.trim(),
            url: service.normalizeUrl(els.editUrlInput.value.trim()),
            thumb: els.editThumbInput.value.trim(),
            tags: els.editTagsInput.value.split(/\s+/).map((tag) => tag.trim()).filter(Boolean),
            favorite: els.editFavoriteInput.checked
        };
        updated.productId = service.extractProductIdFromUrl(updated.url);

        const others = state.library.filter((item) => item !== state.editingWork);
        if (service.isDuplicateWork(updated, others)) {
            alert("保存できません。重複作品です。");
            return;
        }

        Object.assign(state.editingWork, service.normalizeStoredWork(updated, state.editingWork.order ?? 0));
        await commitLibrary(state.library, { resetPage: false, syncSearch: true });
        renderer.closeEditModal();
        ui.setStatus("作品情報を更新しました", "success");
    },

    async handleAddTag(work, tag) {
        const nextTag = String(tag || "").trim();
        if (!nextTag) return;
        work.tags = Array.isArray(work.tags) ? work.tags : [];
        if (!work.tags.includes(nextTag)) {
            work.tags.push(nextTag);
            await commitLibrary(state.library, { resetPage: false, syncSearch: true });
        }
    },

    async handleRemoveTag(work, tag) {
        if (!Array.isArray(work.tags)) return;
        work.tags = work.tags.filter((t) => t !== tag);
        await commitLibrary(state.library, { resetPage: false, syncSearch: true });
    },

    async handleToggleFavorite(work) {
        work.favorite = !work.favorite;
        await commitLibrary(state.library, { resetPage: false, syncSearch: true });
    },

    async handleDeleteWork(work) {
        if (!confirm(`「${work.title || "Untitled"}」をライブラリから削除しますか？`)) return;
        const nextLibrary = state.library.filter((item) => item !== work);
        await commitLibrary(nextLibrary, { resetPage: false, syncSearch: true });
        ui.setStatus("1件削除しました", "info");
    },

    async handleResetFavorites() {
        if (!confirm("お気に入り状態をすべて解除しますか？")) return;
        state.library.forEach((work) => {
            work.favorite = false;
        });
        await commitLibrary(state.library, { resetPage: false, syncSearch: true });
        ui.setStatus("お気に入りをすべて解除しました", "info");
    },

    async handleClearLibrary() {
        if (!confirm("ライブラリを削除しますか？")) return;
        els.searchBox.value = "";
        state.filteredLibrary = null;
        state.currentPage = 1;
        await commitLibrary([], { resetPage: true, syncSearch: true });
        ui.setStatus("ライブラリを削除しました", "info");
    },

    async importFromHtml() {
        const raw = String(els.htmlInput.value || "");
        if (!raw.trim()) {
            alert("HTMLが空です");
            return;
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(raw, "text/html");
        const links = service.getImportLinkCandidates(doc);

        if (links.length === 0) {
            alert("作品リンクが見つかりませんでした");
            return;
        }

        const nextOrder = service.getNextOrder(state.library);
        const candidates = [];
        let skippedCount = 0;

        links.forEach((anchor, index) => {
            const work = service.extractWorkFromAnchor(anchor, nextOrder + index);
            if (!work) {
                skippedCount++;
                return;
            }
            candidates.push(work);
        });

        const result = service.syncImportedItemsOrder(state.library, candidates, {
            requireVoiceCategory: true
        });

        result.skippedCount += skippedCount;

        await commitLibrary(result.library, { resetPage: true, syncSearch: true });

        ui.setStatus(
            `${result.addedCount} 件追加 / 重複 ${result.duplicateCount} 件 / スキップ ${result.skippedCount} 件 / 総件数 ${state.library.length} 件`,
            "success"
        );
    },

    exportJson() {
        const payload = {
            app: "FANZA Voice Library Mobile",
            version: 1,
            exportedAt: new Date().toISOString(),
            itemCount: state.library.length,
            items: state.library
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "fanza-library-mobile.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        ui.setStatus(`${state.library.length} 件を書き出しました`, "success");
    },

    async importJson(file, mode = "merge") {
        if (!file) return;

        const text = await file.text();
        const parsedResult = service.parseJsonPayload(text);

        if (!parsedResult.ok) {
            alert(parsedResult.error);
            ui.hideJsonPreview();
            return;
        }

        const { payload, items } = parsedResult;
        ui.showJsonPreview(service.summarizeJsonPayload(payload, items));

        const normalizedItems = items.map((item, index) =>
            service.normalizeStoredWork(item, service.getNextOrder(state.library) + index)
        );

        if (mode === "replace") {
            if (!confirm(`現在のライブラリ ${state.library.length} 件を、JSON ${normalizedItems.length} 件で置き換えますか？`)) {
                return;
            }

            const deduped = [];
            normalizedItems.forEach((item, index) => {
                const normalized = service.normalizeStoredWork(item, index);
                if (!service.isDuplicateWork(normalized, deduped)) {
                    deduped.push(normalized);
                }
            });

            deduped.forEach((work, index) => {
                work.order = index;
            });

            await commitLibrary(deduped, { resetPage: true, syncSearch: true });

            ui.setStatus(
                `JSON置き換え完了: ${deduped.length} 件を復元しました`,
                "success"
            );
            return;
        }

        const result = service.syncImportedItemsOrder(state.library, normalizedItems, {
            requireVoiceCategory: false
        });

        await commitLibrary(result.library, { resetPage: true, syncSearch: true });

        ui.setStatus(
            `JSON追加完了: 追加 ${result.addedCount} 件 / 重複 ${result.duplicateCount} 件 / 総件数 ${state.library.length} 件`,
            "success"
        );
    },

    bindEvents() {
        els.toggleHtmlPanelBtn.addEventListener("click", () => {
            state.isHtmlPanelOpen = !state.isHtmlPanelOpen;
            ui.updateHtmlPanel();
        });

        els.formatBtn.addEventListener("click", () => {
            els.htmlInput.value = service.formatHTML(els.htmlInput.value);
        });

        els.importBtn.addEventListener("click", () => this.importFromHtml());
        els.exportJsonBtn.addEventListener("click", () => this.exportJson());

        els.importJsonMergeBtn.addEventListener("click", () => {
            state.pendingJsonImportMode = "merge";
            els.jsonFileInput.click();
        });

        els.importJsonReplaceBtn.addEventListener("click", () => {
            state.pendingJsonImportMode = "replace";
            els.jsonFileInput.click();
        });

        els.jsonFileInput.addEventListener("change", async (event) => {
            const file = event.target.files?.[0];
            await this.importJson(file, state.pendingJsonImportMode);
            event.target.value = "";
        });

        els.searchBox.addEventListener("input", () => this.handleSearch());
        els.sortSelect.addEventListener("change", (event) => {
            state.currentSort = event.target.value;
            state.currentPage = 1;
            this.refreshView();
        });

        els.itemsPerPageSelect.addEventListener("change", (event) => {
            const rawValue = event.target.value;
            state.itemsPerPage = rawValue === "all" ? "all" : parseInt(rawValue, 10);
            state.currentPage = 1;
            this.refreshView();
        });

        els.allTabBtn.addEventListener("click", () => {
            state.currentTab = "all";
            state.currentPage = 1;
            ui.updateTabs();
            this.refreshView();
        });

        els.favTabBtn.addEventListener("click", () => {
            state.currentTab = "favorite";
            state.currentPage = 1;
            ui.updateTabs();
            this.refreshView();
        });

        els.circleTabBtn.addEventListener("click", () => {
            state.currentTab = "circle";
            state.currentPage = 1;
            ui.updateTabs();
            this.refreshView();
        });

        els.resetFavBtn.addEventListener("click", () => this.handleResetFavorites());
        els.clearBtn.addEventListener("click", () => this.handleClearLibrary());

        els.saveEditBtn.addEventListener("click", () => this.saveEdit());
        els.cancelEditBtn.addEventListener("click", () => this.closeEdit());
        els.closeEditBtn.addEventListener("click", () => this.closeEdit());

        els.editModal.addEventListener("click", (event) => {
            if (event.target === els.editModal) {
                this.closeEdit();
            }
        });

        els.htmlInput.addEventListener("paste", () => {
            requestAnimationFrame(() => {
                if (!els.autoFormatCheck.checked) return;
                const raw = els.htmlInput.value.trim();
                if (!raw) return;
                els.htmlInput.value = service.formatHTML(raw);
            });
        });
    }
};

function init() {
    ui.updateHtmlPanel();
    ui.updateTabs();
    ui.hideJsonPreview();
    controller.bindEvents();
    controller.loadLibrary();
}

window.addEventListener("load", init);
