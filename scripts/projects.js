window.addEventListener(
  "scroll",
  () => {
    document.getElementById("projtable").style.setProperty(
      "--scroll",
      window.scrollY / (document.body.offsetHeight - window.innerHeight)
    );
  },
  false
);