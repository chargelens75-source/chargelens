/* =========================================================
   CHARGELENS ADMIN — COMMUNITY MODERATION
========================================================= */

let adminCommunityPosts = [];
let adminCommunityComments = [];


/* =========================================================
   START
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        setTimeout(
            () => {

                setupAdminCommunity();

            },
            300
        );

    }
);


/* =========================================================
   SETUP
========================================================= */

function setupAdminCommunity() {

    const sidebar =
        document.querySelector(
            ".sidebar"
        );


    if (!sidebar) {

        console.warn(
            "Admin sidebar not found."
        );

        return;

    }


    /*
     * Add sidebar button.
     */

    if (
        !document.getElementById(
            "adminCommunityNav"
        )
    ) {

        const button =
            document.createElement(
                "button"
            );


        button.id =
            "adminCommunityNav";

        button.type =
            "button";

        button.className =
            "sidebar-item";

        button.dataset.section =
            "community";

        button.innerHTML =
            "💬 Community";


        button.addEventListener(
            "click",
            () => {

                showAdminCommunitySection();

            }
        );


        sidebar.appendChild(
            button
        );

    }


    /*
     * Create section.
     */

    createAdminCommunitySection();

}


/* =========================================================
   CREATE SECTION
========================================================= */

function createAdminCommunitySection() {

    if (
        document.getElementById(
            "section-community"
        )
    ) {

        return;

    }


    const main =
        document.querySelector(
            "main"
        );


    if (!main) {

        return;

    }


    const section =
        document.createElement(
            "section"
        );


    section.id =
        "section-community";

    section.className =
        "admin-section";


    section.innerHTML = `

        <div class="admin-section-header">

            <div>

                <div class="section-eyebrow">
                    COMMUNITY MODERATION
                </div>

                <h2>
                    EV Community
                </h2>

                <p>
                    Review community posts and comments
                    and hide anything inappropriate.
                </p>

            </div>

        </div>


        <div
            style="
                display:grid;
                grid-template-columns:
                    repeat(
                        2,
                        minmax(
                            0,
                            1fr
                        )
                    );
                gap:18px;
            "
        >

            <div class="admin-card">

                <div class="section-eyebrow">
                    POSTS
                </div>

                <h3
                    style="
                        margin-top:6px;
                    "
                >
                    Community posts
                </h3>

                <div
                    id="adminCommunityPosts"
                    style="
                        margin-top:16px;
                    "
                >
                    Loading...
                </div>

            </div>


            <div class="admin-card">

                <div class="section-eyebrow">
                    COMMENTS
                </div>

                <h3
                    style="
                        margin-top:6px;
                    "
                >
                    Community comments
                </h3>

                <div
                    id="adminCommunityComments"
                    style="
                        margin-top:16px;
                    "
                >
                    Loading...
                </div>

            </div>

        </div>

    `;


    main.appendChild(
        section
    );


    /*
     * Make CSS automatically.
     */

    injectAdminCommunityStyles();


    loadAdminCommunityData();

}


/* =========================================================
   SHOW SECTION
========================================================= */

function showAdminCommunitySection() {

    document
        .querySelectorAll(
            ".sidebar-item"
        )
        .forEach(
            item => {

                item.classList.remove(
                    "active"
                );

            }
        );


    document
        .getElementById(
            "adminCommunityNav"
        )
        ?.classList.add(
            "active"
        );


    document
        .querySelectorAll(
            ".admin-section"
        )
        .forEach(
            section => {

                section.classList.remove(
                    "active"
                );

            }
        );


    document
        .getElementById(
            "section-community"
        )
        ?.classList.add(
            "active"
        );


    const title =
        document.getElementById(
            "pageTitle"
        );


    if (title) {

        title.textContent =
            "EV Community";

    }


    loadAdminCommunityData();

}


/* =========================================================
   LOAD DATA
========================================================= */

async function loadAdminCommunityData() {

    const token =
        localStorage.getItem(
            "chargelens_token"
        );


    if (!token) {

        return;

    }


    try {

        const [
            postsResponse,
            commentsResponse
        ] =
            await Promise.all([

                fetch(
                    "/api/admin/community/posts",
                    {

                        headers: {

                            "Authorization":
                                `Bearer ${token}`

                        }

                    }
                ),

                fetch(
                    "/api/admin/community/comments",
                    {

                        headers: {

                            "Authorization":
                                `Bearer ${token}`

                        }

                    }
                )

            ]);


        if (
            postsResponse.status === 401 ||
            commentsResponse.status === 401
        ) {

            localStorage.removeItem(
                "chargelens_token"
            );

            window.location.href =
                "/";

            return;

        }


        const posts =
            await postsResponse.json();


        const comments =
            await commentsResponse.json();


        if (
            !postsResponse.ok
        ) {

            throw new Error(
                getAdminCommunityError(
                    posts,
                    "Unable to load posts."
                )
            );

        }


        if (
            !commentsResponse.ok
        ) {

            throw new Error(
                getAdminCommunityError(
                    comments,
                    "Unable to load comments."
                )
            );

        }


        adminCommunityPosts =
            Array.isArray(
                posts
            )
                ? posts
                : [];


        adminCommunityComments =
            Array.isArray(
                comments
            )
                ? comments
                : [];


        renderAdminCommunityPosts();

        renderAdminCommunityComments();

    }

    catch (error) {

        console.error(
            "Admin Community error:",
            error
        );


        const postsContainer =
            document.getElementById(
                "adminCommunityPosts"
            );


        const commentsContainer =
            document.getElementById(
                "adminCommunityComments"
            );


        if (postsContainer) {

            postsContainer.innerHTML =
                `<p class="admin-community-error">
                    ${escapeAdminCommunityHtml(
                        error.message
                    )}
                </p>`;

        }


        if (commentsContainer) {

            commentsContainer.innerHTML =
                `<p class="admin-community-error">
                    Unable to load comments.
                </p>`;

        }

    }

}


/* =========================================================
   RENDER POSTS
========================================================= */

function renderAdminCommunityPosts() {

    const container =
        document.getElementById(
            "adminCommunityPosts"
        );


    if (!container) {

        return;

    }


    if (
        !adminCommunityPosts.length
    ) {

        container.innerHTML = `

            <div class="admin-community-empty">
                No community posts found.
            </div>

        `;

        return;

    }


    container.innerHTML =
        adminCommunityPosts
            .map(
                post => {

                    const visible =
                        post.is_active === true;


                    return `

                        <article
                            class="
                                admin-community-item
                                ${
                                    visible
                                        ? ""
                                        : "disabled"
                                }
                            "
                        >

                            <div
                                class="
                                    admin-community-meta
                                "
                            >

                                <span>
                                    ${escapeAdminCommunityHtml(
                                        post.category
                                    )}
                                </span>

                                <span>
                                    ${escapeAdminCommunityHtml(
                                        formatAdminCommunityDate(
                                            post.created_at
                                        )
                                    )}
                                </span>

                            </div>


                            <h4>

                                ${escapeAdminCommunityHtml(
                                    post.title
                                )}

                            </h4>


                            <p>

                                ${escapeAdminCommunityHtml(
                                    post.content
                                )}

                            </p>


                            <div
                                class="
                                    admin-community-bottom
                                "
                            >

                                <span>

                                    💬
                                    ${post.comment_count || 0}

                                </span>


                                <button
                                    type="button"
                                    class="
                                        admin-community-toggle
                                        ${
                                            visible
                                                ? "hide"
                                                : "show"
                                        }
                                    "
                                    data-post-id="${post.id}"
                                >

                                    ${
                                        visible
                                            ? "Hide post"
                                            : "Show post"
                                    }

                                </button>

                            </div>

                        </article>

                    `;

                }
            )
            .join("");


    container
        .querySelectorAll(
            "[data-post-id]"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        toggleAdminCommunityPost(
                            Number(
                                button.dataset.postId
                            )
                        );

                    }
                );

            }
        );

}


/* =========================================================
   RENDER COMMENTS
========================================================= */

function renderAdminCommunityComments() {

    const container =
        document.getElementById(
            "adminCommunityComments"
        );


    if (!container) {

        return;

    }


    if (
        !adminCommunityComments.length
    ) {

        container.innerHTML = `

            <div class="admin-community-empty">
                No community comments found.
            </div>

        `;

        return;

    }


    container.innerHTML =
        adminCommunityComments
            .map(
                comment => {

                    const visible =
                        comment.is_active === true;


                    return `

                        <article
                            class="
                                admin-community-item
                                ${
                                    visible
                                        ? ""
                                        : "disabled"
                                }
                            "
                        >

                            <div
                                class="
                                    admin-community-meta
                                "
                            >

                                <span>

                                    Post:
                                    ${escapeAdminCommunityHtml(
                                        comment.post_title
                                    )}

                                </span>

                                <span>

                                    ${escapeAdminCommunityHtml(
                                        formatAdminCommunityDate(
                                            comment.created_at
                                        )
                                    )}

                                </span>

                            </div>


                            <p>

                                ${escapeAdminCommunityHtml(
                                    comment.content
                                )}

                            </p>


                            <div
                                class="
                                    admin-community-bottom
                                "
                            >

                                <span>

                                    Comment #${comment.id}

                                </span>


                                <button
                                    type="button"
                                    class="
                                        admin-community-toggle
                                        ${
                                            visible
                                                ? "hide"
                                                : "show"
                                        }
                                    "
                                    data-comment-id="${comment.id}"
                                >

                                    ${
                                        visible
                                            ? "Hide comment"
                                            : "Show comment"
                                    }

                                </button>

                            </div>

                        </article>

                    `;

                }
            )
            .join("");


    container
        .querySelectorAll(
            "[data-comment-id]"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        toggleAdminCommunityComment(
                            Number(
                                button.dataset.commentId
                            )
                        );

                    }
                );

            }
        );

}


/* =========================================================
   TOGGLE POST
========================================================= */

async function toggleAdminCommunityPost(
    postId
) {

    const token =
        localStorage.getItem(
            "chargelens_token"
        );


    if (!token) {

        window.location.href =
            "/";

        return;

    }


    const post =
        adminCommunityPosts.find(
            item =>
                Number(item.id) ===
                Number(postId)
        );


    if (!post) {

        return;

    }


    const question =
        post.is_active === true
            ? "Hide this community post?"
            : "Show this community post?";


    if (
        !window.confirm(
            question
        )
    ) {

        return;

    }


    try {

        const response =
            await fetch(
                `/api/admin/community/posts/${postId}/toggle`,
                {

                    method:
                        "POST",

                    headers: {

                        "Authorization":
                            `Bearer ${token}`

                    }

                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                getAdminCommunityError(
                    data,
                    "Unable to update post."
                )
            );

        }


        await loadAdminCommunityData();

    }

    catch (error) {

        console.error(
            "Community post moderation error:",
            error
        );


        window.alert(
            error.message
        );

    }

}


/* =========================================================
   TOGGLE COMMENT
========================================================= */

async function toggleAdminCommunityComment(
    commentId
) {

    const token =
        localStorage.getItem(
            "chargelens_token"
        );


    if (!token) {

        window.location.href =
            "/";

        return;

    }


    const comment =
        adminCommunityComments.find(
            item =>
                Number(item.id) ===
                Number(commentId)
        );


    if (!comment) {

        return;

    }


    const question =
        comment.is_active === true
            ? "Hide this community comment?"
            : "Show this community comment?";


    if (
        !window.confirm(
            question
        )
    ) {

        return;

    }


    try {

        const response =
            await fetch(
                `/api/admin/community/comments/${commentId}/toggle`,
                {

                    method:
                        "POST",

                    headers: {

                        "Authorization":
                            `Bearer ${token}`

                    }

                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                getAdminCommunityError(
                    data,
                    "Unable to update comment."
                )
            );

        }


        await loadAdminCommunityData();

    }

    catch (error) {

        console.error(
            "Community comment moderation error:",
            error
        );


        window.alert(
            error.message
        );

    }

}


/* =========================================================
   HELPERS
========================================================= */

function getAdminCommunityError(
    data,
    fallback
) {

    if (!data) {

        return fallback;

    }


    if (
        typeof data.detail ===
        "string"
    ) {

        return data.detail;

    }


    return fallback;

}


function formatAdminCommunityDate(
    timestamp
) {

    if (!timestamp) {

        return "";

    }


    const date =
        new Date(
            timestamp
        );


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "";

    }


    return date.toLocaleString();

}


function escapeAdminCommunityHtml(
    value
) {

    return String(
        value ?? ""
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

}


/* =========================================================
   STYLES
========================================================= */

function injectAdminCommunityStyles() {

    if (
        document.getElementById(
            "admin-community-styles"
        )
    ) {

        return;

    }


    const style =
        document.createElement(
            "style"
        );


    style.id =
        "admin-community-styles";


    style.textContent = `

        .admin-community-item {

            padding:
                15px;

            margin-bottom:
                10px;

            border:
                1px solid
                rgba(255,255,255,.07);

            border-radius:
                12px;

            background:
                rgba(255,255,255,.02);

        }


        .admin-community-item.disabled {

            opacity:
                .50;

        }


        .admin-community-meta {

            display:
                flex;

            justify-content:
                space-between;

            gap:
                10px;

            color:
                #6f8279;

            font-size:
                10px;

        }


        .admin-community-item h4 {

            margin-top:
                10px;

            color:
                #f4f7f5;

            font-size:
                15px;

        }


        .admin-community-item p {

            margin-top:
                8px;

            color:
                #9baea5;

            line-height:
                1.5;

            font-size:
                12px;

        }


        .admin-community-bottom {

            margin-top:
                14px;

            display:
                flex;

            align-items:
                center;

            justify-content:
                space-between;

            gap:
                10px;

            color:
                #667871;

            font-size:
                10px;

        }


        .admin-community-toggle {

            min-height:
                34px;

            padding:
                0 11px;

            border:
                1px solid
                rgba(255,255,255,.08);

            border-radius:
                7px;

            background:
                rgba(255,255,255,.03);

            color:
                #f4f7f5;

            cursor:
                pointer;

            font-weight:
                750;

        }


        .admin-community-toggle.hide {

            color:
                #f25d5d;

            border-color:
                rgba(242,93,93,.20);

        }


        .admin-community-toggle.show {

            color:
                #41e39b;

            border-color:
                rgba(65,227,155,.20);

        }


        .admin-community-empty {

            padding:
                25px;

            text-align:
                center;

            color:
                #667871;

            border:
                1px solid
                rgba(255,255,255,.06);

            border-radius:
                10px;

        }


        .admin-community-error {

            color:
                #f25d5d;

        }


        @media (
            max-width: 800px
        ) {

            #section-community > div {

                grid-template-columns:
                    1fr !important;

            }

        }

    `;


    document.head.appendChild(
        style
    );

}