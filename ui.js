export function switchView(view) {
  document.querySelectorAll('.app-view').forEach(v => v.classList.add('d-none'));
  document.getElementById('view-' + view).classList.remove('d-none');

  document.querySelectorAll('[data-view]').forEach(link => link.classList.remove('active'));
  const activeLink = document.querySelector(`[data-view="${view}"]`);
  if (activeLink) activeLink.classList.add('active');
}

export function initViewRouter() {
  document.querySelectorAll('[data-view]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const view = link.dataset.view;
      switchView(view);
    });
  });
}
