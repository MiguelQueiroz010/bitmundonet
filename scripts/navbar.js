window.onscroll = function() {scrollFunction()};

function scrollFunction() {


var maxH = window.innerHeight * 0.6;
var minH = window.innerHeight * 0.4;

  if (window.scrollY >= maxH) {
    document.getElementById("navbar").style.top = "0";
    document.getElementById("navbar").style.position = "fixed";
    document.getElementById("banner").style.display="none";

  } 
  if(window.scrollY <= minH) {
    document.getElementById("navbar").style.position = "relative";
    document.getElementById("banner").style.display="inline-block";

  }
}