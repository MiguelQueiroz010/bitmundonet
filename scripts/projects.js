function setProjectView(view) {
  const grids = document.querySelectorAll('.projects-grid');
  const gridBtn = document.getElementById('grid-view');
  const listBtn = document.getElementById('list-view');

  if (view === 'list') {
    grids.forEach(grid => grid.classList.add('list-mode'));
    gridBtn.classList.remove('active');
    listBtn.classList.add('active');
    localStorage.setItem('projectsView', 'list');
  } else {
    grids.forEach(grid => grid.classList.remove('list-mode'));
    gridBtn.classList.add('active');
    listBtn.classList.remove('active');
    localStorage.setItem('projectsView', 'grid');
  }
}

// Load preference
document.addEventListener('DOMContentLoaded', () => {
  const savedView = localStorage.getItem('projectsView');
  if (savedView === 'list') {
    setProjectView('list');
  }
});