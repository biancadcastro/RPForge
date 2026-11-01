const search = document.querySelector('#busca');
const chapters = [...document.querySelectorAll('.chapter')];
const links = [...document.querySelectorAll('nav a')];
const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
search.addEventListener('input', () => {
  const query = normalize(search.value.trim());
  let count = 0;
  chapters.forEach((chapter, i) => {
    const match = normalize(chapter.textContent).includes(query);
    chapter.hidden = !match; links[i].hidden = !match; if (match) count++;
  });
  document.querySelector('#sem-resultados').hidden = count !== 0;
});
const observer = new IntersectionObserver(entries => entries.forEach(entry => {
  if (entry.isIntersecting) links.forEach(link => link.classList.toggle('active', link.hash === '#' + entry.target.id));
}), { rootMargin: '-5% 0px -65% 0px' });
chapters.forEach(chapter => observer.observe(chapter));
const dialog = document.querySelector('#zoom');
let previousFocus;
document.querySelectorAll('.capture').forEach(button => button.addEventListener('click', () => {
  previousFocus = button; const image = button.querySelector('img');
  dialog.querySelector('img').src = image.src;
  dialog.querySelector('img').alt = image.alt;
  dialog.querySelector('p').textContent = image.alt;
  dialog.showModal();
}));
dialog.querySelector('.close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => previousFocus?.focus());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
