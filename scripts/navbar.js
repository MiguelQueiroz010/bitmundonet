window.onscroll = function () { scrollFunction() };

function scrollFunction() {


  var maxH = window.innerHeight * 0.6;
  var minH = window.innerHeight * 0.4;

  if (window.scrollY >= maxH) {
    document.getElementById("navbar").style.top = "0";
    document.getElementById("navbar").style.position = "fixed";
    document.getElementById("head").style.display = "none";
  }
  if (window.scrollY <= minH / 2) {
    document.getElementById("navbar").style.position = "relative";
    document.getElementById("head").style.display = "inline";
  }
}

function dropdown() {
  if (document.getElementById("dropdown").style.animationName == "slide_in") {
    document.getElementById("mobile_dropdown").style.position = "relative";
    document.body.style.overflow = "auto";
    document.getElementById("mobile_dropdown").style.display = "block";
    document.getElementById("dropdown").style.animationName = "slide_out";
    document.getElementById("dropdown").style.animationDuration = "0.45s";
    document.getElementById("mobile_logo").style.display = "block";
  }
  else {
    document.getElementById("mobile_dropdown").style.position = "relative";
    document.body.style.overflow = "hidden";
    document.getElementById("mobile_dropdown").style.position = "relative";
    document.getElementById("mobile_dropdown").style.display = "none";
    document.getElementById("dropdown").style.animationName = "slide_in";
    document.getElementById("dropdown").style.animationDuration = "0.45s";
    document.getElementById("mobile_logo").style.display = "none";
  }


}