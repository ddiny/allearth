(() => {
  'use strict';

  const PAGE = 5;
  const MAX_TEXT = 200;
  const instances = new Set();
  let sequence = 0;

  const store = () => window.AllEarthStore;
  const keyOf = (kind, id) => `${kind}:${id}`;
  const clone = value => JSON.parse(JSON.stringify(value));
  const button = (text, action, className = '') => {
    const node = document.createElement('button');
    node.type = 'button';
    node.textContent = text;
    node.dataset.action = action;
    node.className = className;
    return node;
  };
  const element = (tag, className = '', text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const freshId = prefix => `${prefix}-${Date.now().toString(36)}-${(++sequence).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const active = comment => comment && !comment.deleted;
  const numericTime = value => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Date.now();
  };
  const defaultUi = () => ({ draft: '', replyTo: null, editId: null, editText: '', sort: 'new', expanded: {}, scroll: 0 });

  function normalizeComment(value, index, fallbackName, fallbackTime) {
    const source = typeof value === 'string' ? { text: value, own: true, name: fallbackName } : (value || {});
    return {
      id: String(source.id || freshId(`comment${index}`)),
      parentId: source.parentId == null ? null : String(source.parentId),
      name: String(source.name || (source.own ? fallbackName : 'AllEarth 사용자')),
      own: Boolean(source.own),
      text: String(source.text || ''),
      created: numericTime(source.created || fallbackTime),
      likes: Math.max(0, Number(source.likes) || 0),
      liked: Boolean(source.liked),
      deleted: Boolean(source.deleted),
    };
  }

  function normalizeThread(thread) {
    const comments = Array.isArray(thread?.comments) ? thread.comments : [];
    return {
      comments: comments.map((comment, index) => normalizeComment(comment, index, 'Aegungi', Date.now() - (comments.length - 1 - index))),
      baseCount: Math.max(0, Number(thread?.baseCount) || 0),
    };
  }

  function ensureThread(kind, id) {
    const key = keyOf(kind, id);
    const current = store().read();
    if (current.commentThreads?.[key]) return normalizeThread(current.commentThreads[key]);

    let seed = [];
    let aggregate = 0;
    if (kind === 'post') {
      const post = store().getFeed().records?.find(record => String(record.id) === String(id));
      seed = Array.isArray(post?.commentList) ? post.commentList : [];
      aggregate = Math.max(0, Number(post?.comments ?? post?.commentCount) || 0);
    }
    const accountName = current.account?.nickname || 'Aegungi';
    const now = Date.now();
    const comments = seed.map((comment, index) => normalizeComment(comment, index, accountName, now - (seed.length - 1 - index)));
    const known = comments.filter(active).length;
    // Existing cards sometimes only have an aggregate. Keep the unmaterialized portion
    // separately so hydration never inflates the displayed total.
    const thread = { comments, baseCount: Math.max(0, aggregate - known) };
    let hydrated = thread;
    const result = perform('comment-hydrate', () => {
      store().update(app => {
        app.commentThreads ||= {};
        app.commentUi ||= {};
        app.commentThreads[key] ||= clone(thread);
        app.commentUi[key] ||= defaultUi();
        hydrated = normalizeThread(app.commentThreads[key]);
      });
      syncPost(kind, id, hydrated);
      return hydrated;
    });
    // Hydration has no user action to retry. Surface a usable in-memory view and let
    // the next explicit action report a persistence error instead of breaking render.
    return result?.ok ? normalizeThread(result.value) : thread;
  }

  function readUi(kind, id) {
    const raw = store().read().commentUi?.[keyOf(kind, id)] || {};
    return {
      ...defaultUi(),
      ...raw,
      sort: raw.sort === 'popular' ? 'popular' : 'new',
      expanded: raw.expanded && typeof raw.expanded === 'object' ? raw.expanded : {},
      scroll: Math.max(0, Number(raw.scroll) || 0),
    };
  }

  function updateUi(kind, id, change) {
    const key = keyOf(kind, id);
    store().update(app => {
      app.commentUi ||= {};
      const ui = { ...defaultUi(), ...(app.commentUi[key] || {}) };
      if (typeof change === 'function') change(ui);
      else Object.assign(ui, change);
      app.commentUi[key] = ui;
    });
  }

  function countThread(thread) {
    return Math.max(0, Number(thread.baseCount) || 0) + thread.comments.filter(active).length;
  }

  function syncPost(kind, id, thread) {
    if (kind !== 'post') return;
    const feed = store().getFeed();
    const post = feed.records?.find(record => String(record.id) === String(id));
    if (!post) return;
    post.commentList = clone(thread.comments);
    post.comments = countThread(thread);
    post.commentCount = post.comments;
    store().setFeed(feed);
  }

  function mutate(kind, id, mutateFn) {
    const key = keyOf(kind, id);
    let nextThread;
    store().update(app => {
      app.commentThreads ||= {};
      const existing = app.commentThreads[key];
      if (!existing) throw new Error('댓글 정보를 불러오지 못했어요. 다시 시도해 주세요.');
      const thread = normalizeThread(existing);
      mutateFn(thread);
      app.commentThreads[key] = thread;
      nextThread = clone(thread);
    });
    syncPost(kind, id, nextThread);
    return nextThread;
  }

  function perform(action, fn) {
    const service = store();
    if (typeof service.perform === 'function') return service.perform(action, fn);
    try { return { ok: true, value: fn() }; }
    catch (error) { return { ok: false, message: error?.message || '처리하지 못했어요. 다시 시도해 주세요.' }; }
  }

  function relativeTime(created) {
    const elapsed = Math.max(0, Date.now() - numericTime(created));
    if (elapsed < 60_000) return '방금';
    if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}분`;
    if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}시간`;
    return `${Math.floor(elapsed / 86_400_000)}일`;
  }

  function controller(host, options, modalContext) {
    if (!host || !['post', 'issue'].includes(options?.kind) || options.id == null) {
      throw new Error('댓글을 표시할 요소와 kind/id가 필요합니다.');
    }
    const kind = options.kind;
    const id = String(options.id);
    const busy = new Set();
    let destroyed = false;
    let error = null;
    let confirmation = null;
    let menuId = null;
    let restoreScroll = true;
    let pendingScroll = null;
    let scrollTimer = 0;

    host.classList.add('aec', modalContext ? 'aec-modal-body' : 'aec-inline');
    host.addEventListener('click', stopAtHost);
    host.addEventListener('pointerdown', stopAtHost);
    host.addEventListener('submit', stopAtHost);
    host.addEventListener('input', onInput);
    host.addEventListener('click', onClick);
    host.addEventListener('submit', onSubmit);
    host.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', flushScroll);
    window.addEventListener('allearth:beforeNavigate', flushScroll);
    ensureThread(kind, id);
    render();

    function stopAtHost(event) { event.stopPropagation(); }
    function thread() { return ensureThread(kind, id); }
    function ui() { return readUi(kind, id); }
    function announceChange(value) {
      options.onChange?.({ kind, id, count: countThread(value), thread: clone(value) });
      window.dispatchEvent(new CustomEvent('allearth:comments', { detail: { kind, id, count: countThread(value) } }));
    }
    function setBusy(token, value) {
      value ? busy.add(token) : busy.delete(token);
      render(false);
    }
    function fail(message, retry) {
      error = { message: message || '처리하지 못했어요. 다시 시도해 주세요.', retry };
      render(false);
    }
    function actionLater(action, token, retry, fn) {
      if (busy.has(token)) return;
      error = null;
      setBusy(token, true);
      window.setTimeout(() => {
        if (destroyed) return;
        const result = perform(action, fn);
        busy.delete(token);
        if (!result?.ok) return fail(result?.message, retry);
        error = null;
        confirmation = null;
        menuId = null;
        if (result.value?.comments) announceChange(result.value);
        render(false);
      }, 140);
    }

    function sortedParents(value, sort) {
      const parents = value.comments.filter(comment => comment.parentId == null);
      return parents.sort((a, b) => sort === 'popular'
        ? (Number(b.likes) - Number(a.likes) || numericTime(b.created) - numericTime(a.created))
        : numericTime(b.created) - numericTime(a.created));
    }
    function repliesFor(value, parentId) {
      return value.comments
        .filter(comment => comment.parentId === parentId && active(comment))
        .sort((a, b) => numericTime(b.created) - numericTime(a.created));
    }
    function findComment(commentId) { return thread().comments.find(comment => comment.id === commentId); }

    function row(comment, value, state, parentId = null) {
      const wrapper = element('article', `aec-row${comment.deleted ? ' is-deleted' : ''}${state.replyTo === comment.id ? ' is-target' : ''}`);
      wrapper.dataset.commentId = comment.id;
      if (comment.deleted) {
        wrapper.append(element('p', 'aec-tombstone', '삭제된 댓글입니다.'));
      } else {
        const head = element('header', 'aec-row-head');
        const avatar = element('span', `aec-avatar${comment.own ? ' is-own' : ''}`, (comment.name || '?').slice(0, 1));
        const identity = element('div', 'aec-identity');
        const name = element('strong', '', comment.name);
        identity.append(name, element('span', '', `${relativeTime(comment.created)} · 좋아요 ${comment.likes}개${comment.own ? ' · 내 댓글' : ''}`));
        head.append(avatar, identity);
        if (comment.own) {
          const more = button('⋯', 'menu', 'aec-icon');
          more.dataset.commentId = comment.id;
          more.setAttribute('aria-label', '내 댓글 메뉴');
          more.setAttribute('aria-expanded', String(menuId === comment.id));
          head.append(more);
        }
        wrapper.append(head);
        if (state.editId === comment.id) {
          const form = element('form', 'aec-edit');
          form.dataset.editId = comment.id;
          const area = document.createElement('textarea');
          area.dataset.field = 'edit';
          area.maxLength = MAX_TEXT;
          area.value = state.editText;
          area.setAttribute('aria-label', '댓글 수정');
          const controls = element('div', 'aec-edit-actions');
          const cancel = button('취소', 'cancel-edit', 'aec-button is-line');
          const save = button('수정 완료', 'save-edit', 'aec-button is-ink');
          save.type = 'submit';
          const valid = state.editText.trim() && state.editText.trim() !== comment.text.trim();
          save.disabled = !valid || busy.has(`edit:${comment.id}`);
          controls.append(cancel, save);
          form.append(area, controls);
          wrapper.append(form);
        } else {
          wrapper.append(element('p', 'aec-text', comment.text));
          const actions = element('div', 'aec-row-actions');
          const like = button(`♡ ${comment.likes}`, 'like');
          like.dataset.commentId = comment.id;
          like.classList.toggle('is-on', comment.liked);
          like.setAttribute('aria-pressed', String(comment.liked));
          like.disabled = busy.has(`like:${comment.id}`);
          const reply = button('답글 달기', 'reply');
          reply.dataset.commentId = comment.id;
          actions.append(like, reply);
          wrapper.append(actions);
        }
        if (menuId === comment.id) {
          const menu = element('div', 'aec-menu');
          menu.setAttribute('role', 'menu');
          const edit = button('수정', 'edit');
          const remove = button('삭제', 'ask-delete', 'is-danger');
          edit.dataset.commentId = remove.dataset.commentId = comment.id;
          menu.append(edit, remove);
          wrapper.append(menu);
        }
      }

      if (parentId == null) {
        const replies = repliesFor(value, comment.id);
        const visible = Math.max(0, Number(state.expanded[comment.id]) || 0);
        if (replies.length && !visible) {
          const expand = button(`답글 보기 (${replies.length}개)`, 'expand', 'aec-reply-toggle');
          expand.dataset.commentId = comment.id;
          expand.disabled = busy.has(`load:${comment.id}`);
          wrapper.append(expand);
        }
        if (visible) {
          const group = element('div', 'aec-replies');
          group.setAttribute('aria-label', '답글');
          replies.slice(0, visible).forEach(reply => group.append(row(reply, value, state, comment.id)));
          if (visible < replies.length) {
            const more = button(busy.has(`load:${comment.id}`) ? '불러오는 중…' : '대댓글 더보기', 'load-more', 'aec-reply-toggle');
            more.dataset.commentId = comment.id;
            more.disabled = busy.has(`load:${comment.id}`);
            group.append(more);
          }
          wrapper.append(group);
        }
      }
      return wrapper;
    }

    function render(restore = restoreScroll) {
      if (destroyed) return;
      const value = thread();
      const state = ui();
      const previousScroll = restore ? state.scroll : (pendingScroll ?? host.scrollTop);
      pendingScroll = previousScroll;
      host.replaceChildren();

      const top = element('div', 'aec-top');
      const heading = element('div', 'aec-heading');
      heading.append(element('h2', '', `댓글 ${countThread(value)}`));
      const sorts = element('div', 'aec-sort');
      [['new', '최신순'], ['popular', '인기순']].forEach(([sort, label]) => {
        const control = button(label, 'sort');
        control.dataset.sort = sort;
        control.classList.toggle('is-active', state.sort === sort);
        control.setAttribute('aria-pressed', String(state.sort === sort));
        sorts.append(control);
      });
      top.append(heading, sorts);
      host.append(top);

      if (error) {
        const notice = element('div', 'aec-error');
        notice.setAttribute('role', 'alert');
        notice.append(element('span', '', error.message));
        if (error.retry) {
          const retry = button('다시 시도', 'retry');
          retry.dataset.retry = JSON.stringify(error.retry);
          notice.append(retry);
        }
        host.append(notice);
      }

      const list = element('div', 'aec-list');
      const parents = sortedParents(value, state.sort);
      if (!parents.length) list.append(element('p', 'aec-empty', '아직 댓글이 없어요. 첫 댓글을 남겨 보세요.'));
      else parents.forEach(comment => list.append(row(comment, value, state)));
      host.append(list);

      const account = store().read().account || {};
      const target = state.replyTo ? value.comments.find(comment => comment.id === state.replyTo && active(comment)) : null;
      const composer = element('form', 'aec-composer');
      composer.dataset.form = 'comment';
      if (target) {
        const context = element('div', 'aec-compose-context');
        context.append(element('span', '', `${target.name}님에게 답글 작성 중`));
        const cancel = button('×', 'cancel-reply', 'aec-icon');
        cancel.setAttribute('aria-label', '답글 작성 취소');
        context.append(cancel);
        composer.append(context);
      }
      const fieldRow = element('div', 'aec-field-row');
      if (target) fieldRow.append(element('span', 'aec-mention', `@${target.name}`));
      const input = document.createElement('textarea');
      input.dataset.field = 'draft';
      input.maxLength = MAX_TEXT;
      input.rows = 1;
      input.value = state.draft;
      input.placeholder = target ? '답글 추가...' : '댓글 추가...';
      input.setAttribute('aria-label', target ? `${target.name}에게 답글` : '댓글');
      input.disabled = !account.loggedIn;
      const submit = button(busy.has('add') ? '등록 중…' : '등록', 'submit', 'aec-submit');
      submit.type = 'submit';
      submit.disabled = !account.loggedIn || !state.draft.trim() || busy.has('add');
      fieldRow.append(input, submit);
      composer.append(fieldRow);
      if (!account.loggedIn) composer.append(element('p', 'aec-login-note', '댓글을 작성하려면 로그인이 필요해요.'));
      else if (state.draft) {
        const draftActions = element('div', 'aec-draft-actions');
        draftActions.append(element('span', '', '입력 내용은 자동 저장됩니다.'), button('초안 지우기', 'discard-draft'));
        composer.append(draftActions);
      }
      host.append(composer);

      if (confirmation) host.append(confirmView(confirmation));
      requestAnimationFrame(() => {
        if (destroyed) return;
        host.scrollTop = previousScroll;
        if (pendingScroll === previousScroll) pendingScroll = null;
        restoreScroll = true;
      });
    }

    function confirmView(value) {
      const dim = element('div', 'aec-confirm-dim');
      const box = element('section', 'aec-confirm');
      box.setAttribute('role', 'alertdialog');
      box.setAttribute('aria-modal', 'true');
      const deleting = value.type === 'delete';
      const editing = value.type === 'discard-edit';
      box.append(
        element('h3', '', deleting ? '댓글을 삭제할까요?' : editing ? '수정 내용을 지울까요?' : '작성 중인 내용을 지울까요?'),
        element('p', '', deleting ? '삭제한 댓글은 복구할 수 없어요.' : editing ? '변경한 내용은 저장되지 않아요.' : '저장된 초안은 삭제 후 복구할 수 없어요.')
      );
      const deleteFailed = deleting && error?.retry?.type === 'delete' && error.retry.id === value.id;
      if (deleteFailed) box.append(element('p', 'aec-confirm-error', error.message));
      const actions = element('div', 'aec-confirm-actions');
      actions.append(button('취소', 'cancel-confirm', 'aec-button is-line'));
      const accept = button(deleting ? (deleteFailed ? '다시 삭제' : '삭제') : '지우기', deleting ? 'delete' : 'discard-confirmed', 'aec-button is-danger');
      if (value.id) accept.dataset.commentId = value.id;
      accept.disabled = deleting && busy.has(`delete:${value.id}`);
      actions.append(accept);
      box.append(actions);
      dim.append(box);
      return dim;
    }

    function onInput(event) {
      const field = event.target.dataset.field;
      if (field === 'draft') {
        updateUi(kind, id, { draft: event.target.value });
        const submit = host.querySelector('.aec-submit');
        if (submit) submit.disabled = !event.target.value.trim() || busy.has('add');
        const existing = host.querySelector('.aec-draft-actions');
        if (!existing && event.target.value) render(false);
        if (existing && !event.target.value) render(false);
      } else if (field === 'edit') {
        updateUi(kind, id, { editText: event.target.value });
        const current = findComment(event.target.closest('[data-edit-id]')?.dataset.editId);
        const save = event.target.closest('form')?.querySelector('[data-action="save-edit"]');
        if (save) save.disabled = !event.target.value.trim() || event.target.value.trim() === current?.text.trim();
      }
    }

    function onScroll() {
      clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => updateUi(kind, id, { scroll: host.scrollTop }), 60);
    }

    function flushScroll() {
      clearTimeout(scrollTimer);
      if (!destroyed) updateUi(kind, id, { scroll: pendingScroll ?? host.scrollTop });
    }

    function onSubmit(event) {
      const form = event.target.closest('form');
      if (!form || !host.contains(form)) return;
      event.preventDefault();
      if (form.dataset.form === 'comment') submitComment();
      if (form.dataset.editId) saveEdit(form.dataset.editId);
    }

    function onClick(event) {
      const control = event.target.closest('[data-action]');
      if (!control || !host.contains(control)) {
        if (menuId) { menuId = null; render(false); }
        return;
      }
      const action = control.dataset.action;
      const commentId = control.dataset.commentId;
      if (action === 'sort') {
        updateUi(kind, id, { sort: control.dataset.sort });
        render(false);
      } else if (action === 'like') toggleLike(commentId);
      else if (action === 'reply') startReply(commentId);
      else if (action === 'cancel-reply') cancelReply();
      else if (action === 'menu') { menuId = menuId === commentId ? null : commentId; render(false); }
      else if (action === 'edit') startEdit(commentId);
      else if (action === 'cancel-edit') cancelEdit();
      else if (action === 'ask-delete') { confirmation = { type: 'delete', id: commentId }; menuId = null; render(false); }
      else if (action === 'cancel-confirm') { confirmation = null; render(false); }
      else if (action === 'delete') deleteComment(commentId);
      else if (action === 'expand' || action === 'load-more') loadReplies(commentId);
      else if (action === 'discard-draft') { confirmation = { type: 'discard' }; render(false); }
      else if (action === 'discard-confirmed') {
        if (confirmation?.type === 'discard-edit') discardEdit();
        else discardDraft();
      }
      else if (action === 'retry') retryAction(control.dataset.retry);
    }

    function submitComment() {
      const state = ui();
      const body = state.draft.trim();
      if (!body || busy.has('add')) return;
      const value = thread();
      const target = state.replyTo ? value.comments.find(comment => comment.id === state.replyTo && active(comment)) : null;
      const parent = target ? (target.parentId || target.id) : null;
      const text = target ? `@${target.name} ${body}` : body;
      actionLater('comment-add', 'add', { type: 'add' }, () => {
        const account = store().read().account;
        if (!account?.loggedIn) throw new Error('로그인이 필요해요.');
        const next = mutate(kind, id, draft => {
          draft.comments.push({ id: freshId('comment'), parentId: parent, name: account.nickname || 'Aegungi', own: true, text, created: Date.now(), likes: 0, liked: false, deleted: false });
        });
        updateUi(kind, id, current => {
          current.draft = '';
          current.replyTo = null;
          if (parent) current.expanded = { ...current.expanded, [parent]: Math.max(PAGE, Number(current.expanded?.[parent]) || 0) };
        });
        return next;
      });
    }

    function toggleLike(commentId) {
      const token = `like:${commentId}`;
      actionLater('comment-like', token, { type: 'like', id: commentId }, () => mutate(kind, id, value => {
        const comment = value.comments.find(item => item.id === commentId && active(item));
        if (!comment) throw new Error('댓글을 찾을 수 없어요.');
        comment.liked = !comment.liked;
        comment.likes = Math.max(0, comment.likes + (comment.liked ? 1 : -1));
      }));
    }

    function startReply(commentId) {
      const comment = findComment(commentId);
      if (!comment || comment.deleted) return;
      const state = ui();
      if (state.editId) return;
      updateUi(kind, id, { replyTo: commentId });
      render(false);
      focus();
    }

    function cancelReply() {
      const state = ui();
      if (state.draft.trim()) {
        confirmation = { type: 'discard' };
        render(false);
      } else {
        updateUi(kind, id, { replyTo: null });
        render(false);
      }
    }

    function discardDraft() {
      updateUi(kind, id, { draft: '', replyTo: null });
      confirmation = null;
      error = null;
      render(false);
    }

    function discardEdit() {
      updateUi(kind, id, { editId: null, editText: '' });
      confirmation = null;
      error = null;
      render(false);
    }

    function startEdit(commentId) {
      const comment = findComment(commentId);
      if (!comment?.own || comment.deleted) return;
      updateUi(kind, id, { editId: commentId, editText: comment.text });
      menuId = null;
      render(false);
      requestAnimationFrame(() => {
        const area = host.querySelector(`[data-edit-id="${CSS.escape(commentId)}"] textarea`);
        area?.focus();
        area?.setSelectionRange(area.value.length, area.value.length);
      });
    }

    function cancelEdit() {
      const state = ui();
      const comment = findComment(state.editId);
      if (state.editText.trim() !== (comment?.text || '').trim()) {
        confirmation = { type: 'discard-edit' };
        render(false);
      } else {
        updateUi(kind, id, { editId: null, editText: '' });
        render(false);
      }
    }

    function saveEdit(commentId) {
      const state = ui();
      const text = state.editText.trim();
      const current = findComment(commentId);
      if (!current?.own || !text || text === current.text.trim()) return;
      actionLater('comment-edit', `edit:${commentId}`, { type: 'edit', id: commentId }, () => {
        const next = mutate(kind, id, value => {
          const comment = value.comments.find(item => item.id === commentId && item.own && active(item));
          if (!comment) throw new Error('수정할 댓글을 찾을 수 없어요.');
          comment.text = text;
        });
        updateUi(kind, id, { editId: null, editText: '' });
        return next;
      });
    }

    function deleteComment(commentId) {
      const token = `delete:${commentId}`;
      actionLater('comment-delete', token, { type: 'delete', id: commentId }, () => {
        const next = mutate(kind, id, value => {
          const index = value.comments.findIndex(item => item.id === commentId && item.own && active(item));
          if (index < 0) throw new Error('삭제할 댓글을 찾을 수 없어요.');
          const comment = value.comments[index];
          const hasReplies = comment.parentId == null && value.comments.some(item => item.parentId === comment.id && active(item));
          if (hasReplies) {
            comment.deleted = true;
            comment.text = '';
            comment.likes = 0;
            comment.liked = false;
          } else value.comments.splice(index, 1);
        });
        updateUi(kind, id, state => {
          if (state.editId === commentId) { state.editId = null; state.editText = ''; }
          if (state.replyTo === commentId) state.replyTo = null;
        });
        return next;
      });
    }

    function loadReplies(parentId) {
      const token = `load:${parentId}`;
      actionLater('reply-load', token, { type: 'load', id: parentId }, () => {
        const value = thread();
        if (!value.comments.some(item => item.id === parentId && item.parentId == null)) throw new Error('원댓글을 찾을 수 없어요.');
        updateUi(kind, id, state => {
          const current = Math.max(0, Number(state.expanded?.[parentId]) || 0);
          state.expanded = { ...state.expanded, [parentId]: current ? current + PAGE : PAGE };
        });
        return null;
      });
    }

    function retryAction(serialized) {
      let retry;
      try { retry = JSON.parse(serialized || 'null'); } catch (_) { return; }
      error = null;
      if (retry?.type === 'add') submitComment();
      if (retry?.type === 'like') toggleLike(retry.id);
      if (retry?.type === 'edit') saveEdit(retry.id);
      if (retry?.type === 'delete') { confirmation = { type: 'delete', id: retry.id }; render(false); }
      if (retry?.type === 'load') loadReplies(retry.id);
    }

    function focus() {
      requestAnimationFrame(() => {
        const input = host.querySelector('[data-field="draft"]');
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
      });
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      clearTimeout(scrollTimer);
      updateUi(kind, id, { scroll: pendingScroll ?? host.scrollTop });
      host.removeEventListener('click', stopAtHost);
      host.removeEventListener('pointerdown', stopAtHost);
      host.removeEventListener('submit', stopAtHost);
      host.removeEventListener('input', onInput);
      host.removeEventListener('click', onClick);
      host.removeEventListener('submit', onSubmit);
      host.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', flushScroll);
      window.removeEventListener('allearth:beforeNavigate', flushScroll);
      host.classList.remove('aec', 'aec-modal-body', 'aec-inline');
      host.replaceChildren();
      instances.delete(api);
    }

    const api = { destroy, focus };
    instances.add(api);
    return api;
  }

  function mount(host, options) { return controller(host, options || {}, null); }

  function open(options) {
    const origin = options?.origin instanceof Element ? options.origin : document.activeElement;
    const overlay = element('dialog', 'aec-overlay');
    overlay.setAttribute('aria-label', '댓글');
    const dialog = element('section', 'aec-dialog');
    dialog.tabIndex = -1;
    const handle = element('div', 'aec-handle');
    const header = element('header', 'aec-dialog-head');
    header.append(element('strong', '', '댓글'));
    const closeButton = button('×', 'close-modal', 'aec-icon');
    closeButton.setAttribute('aria-label', '댓글 닫기');
    header.append(closeButton);
    const body = element('div');
    dialog.append(handle, header, body);
    overlay.append(dialog);
    document.body.append(overlay);
    overlay.showModal();
    const mounted = controller(body, options || {}, { overlay, dialog });
    const marker = `aec-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let destroyed = false;
    let closingHistory = false;
    history.pushState({ ...(history.state || {}), allearthComments: marker }, '');

    function close(fromPop = false) {
      if (destroyed) return;
      destroyed = true;
      mounted.destroy();
      window.removeEventListener('popstate', onPop);
      overlay.removeEventListener('cancel', onCancel);
      if (overlay.open) overlay.close();
      overlay.remove();
      if (!fromPop && history.state?.allearthComments === marker) {
        closingHistory = true;
        history.back();
      }
      origin?.focus?.({ preventScroll: true });
    }
    function onPop() {
      if (closingHistory) return;
      close(true);
    }
    function onCancel(event) {
      event.preventDefault();
      close();
    }
    function onKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab') return;
      const nodes = [...dialog.querySelectorAll('button:not(:disabled),textarea:not(:disabled),[tabindex="0"]')];
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    function onOverlay(event) { if (event.target === overlay) close(); }
    overlay.addEventListener('click', event => {
      if (event.target.closest('[data-action="close-modal"]')) close();
      else onOverlay(event);
    });
    dialog.addEventListener('keydown', onKey);
    overlay.addEventListener('cancel', onCancel);
    window.addEventListener('popstate', onPop);
    requestAnimationFrame(() => { dialog.focus(); mounted.focus(); });
    return { destroy: close, focus: mounted.focus };
  }

  function getCount(kind, id) {
    if (!['post', 'issue'].includes(kind) || id == null) return 0;
    return countThread(ensureThread(kind, String(id)));
  }

  window.AllEarthComments = { mount, open, getCount };
})();
