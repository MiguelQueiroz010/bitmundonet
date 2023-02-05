window.onscroll = function() {scrollFunction()};

function scrollFunction() {
  if (document.body.scrollTop > 20 || document.documentElement.scrollTop > 20) {
    document.getElementById("navbar").style.top = "0";
    document.getElementById("navbar").style.position = "fixed";
    document.getElementById("banner").style.display="none";

  } else {
    document.getElementById("navbar").style.position = "relative";
    document.getElementById("banner").style.display="inline-block";

  }
}