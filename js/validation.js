// validation.js — tiny helper
const Validate = {
  setValidity(el, ok, msg){
    if(!el) return;
    el.classList.toggle('valid', !!ok);
    el.classList.toggle('invalid', !ok);
    el.setCustomValidity(ok?'':(msg||'Invalid'));
  },
  
  markTouched(el){
    if(!el) return;
    el.classList.add('touched');
  },
  
  clearTouched(el){
    if(!el) return;
    el.classList.remove('touched');
  }
};
window.Validate = Validate;
