// validation.js — tiny helper
const Validate = {
  setValidity(el, ok, msg){
    if(!el) return;
    el.classList.toggle('valid', !!ok);
    el.classList.toggle('invalid', !ok);
    el.setCustomValidity(ok?'':(msg||'Invalid'));
  }
};
window.Validate = Validate;
