import md5 from 'js-md5';
import Tooltip from 'tooltip';
import { add, rem } from 'event';
import { emit } from 'socket';
import { preventDefaults, highlight, validFile } from 'utils';

export default class Upload {
 constructor(el, opts, files) {
  this.uploadId_ = Date.now() * Math.random();
  this.el_ = el;
  this.processAB_ = opts.AB;
  this.beforeUpload_ = opts.BU;
  this.afterUpload_ = opts.AU;
  this.form_ = document.createElement('form');
  if (!opts.multiple) this.form_.className = 'drop-area single';
  else this.form_.className = 'drop-area';
  this.input_ = document.createElement('input');
  this.input_.type = 'file';
  this.input_.className = 'inputEl';
  this.input_.multiple = opts.multiple;
  this.files_ = new Map(Object.entries(files || {}));
  this.newFiles_ = new Set();
  const label = document.createElement('label');
  label.className = opts.class || 'btn blue';
  label.appendChild(document.createTextNode(opts.label));
  label.appendChild(this.input_);
  this.progressBar_ = document.createElement('progress');
  this.progressBar_.setAttribute('max', 100);
  this.progressBar_.setAttribute('value', 0);
  this.progressBarVisble_ = false;
  this.gallery_ = document.createElement('div');
  this.gallery_.className = 'gallery';
  this.form_.append(label, this.progressBar_, this.gallery_);
  this.events_();
  if (files) this.previewExisting_(files);
 }

 events_() {
  add(this.input_, 'change', this.handleFiles_.bind(this), this.uploadId_);
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
   add(this.form_, eventName, preventDefaults, this.uploadId_, { capture: false });
   add(document.body, eventName, preventDefaults, this.uploadId_, { capture: false });
  });
  ['dragenter', 'dragleave', 'drop'].forEach((eventName) => add(this.form_, eventName, highlight.bind(this, this.form_), this.uploadId_));
  add(this.form_, 'drop', this.handleDrop_.bind(this), this.uploadId_, { capture: false });
  add(this.gallery_, 'click', this.onClick_.bind(this), this.uploadId_, { capture: false });
  if (this.el_.tagName.toLowerCase() === 'input') this.tip_ = new Tooltip({ ref: this.el_, offset: [0, 6], placement: 'bottom', arrow: true, content: this.form_, hideOnEsc: true });
  else this.el_.appendChild(this.form_);
 }

 onClick_(e) {
  if (e.target.className === 'del') {
   const imgFrame = e.target.parentNode;
   const md5Name = imgFrame.dataset.md5;
   if (imgFrame.dataset.status === '201') emit('del', [md5Name]);
   this.files_.delete(md5Name);
   this.newFiles_.delete(md5Name);
   this.gallery_.removeChild(imgFrame);
  }
 }

 get value() {
  return this.files_.size ? this.files_ : undefined;
 }

 handleDrop_(e) {
  const { items } = e.dataTransfer;
  for (let i = 0; i < items.length; i += 1) {
   if (!this.input_.multiple && i > 0) return;
   const entry = items[i].webkitGetAsEntry();
   if (entry) this.traverse_(entry);
  }
  this.afterUpload_?.(items.length);
 }

 traverse_(entry) {
  if (entry.isFile) entry.file(this.process_.bind(this));
  else if (entry.isDirectory) {
   const dirReader = entry.createReader();
   const readEntries = () => {
    dirReader.readEntries((entries) => {
     if (entries.length) {
      for (let i = 0; i < entries.length; i += 1) this.traverse_(entries[i]);
      readEntries();
     }
    });
   };
   readEntries();
  }
 }

 showProgress_() {
  if (!this.progressBarVisble_) {
   this.progressBarVisble_ = true;
   this.progressBar_.style.visibility = 'visible';
   this.progressBar_.value = 0;
   this.uploadProgress_ = [];
  }
 }

 hideProgress_() {
  this.progressBar_.style.visibility = 'hidden';
  this.progressBarVisble_ = false;
 }

 handleFiles_(e) {
  for (let i = 0; i < e.target.files.length; i += 1) this.process_(e.target.files[i]);
  this.afterUpload_?.(e.target.files.length);
 }

 previewExisting_(files) {
  for (const [key, value] of Object.entries(files)) {
   const imgFrame = document.createElement('div');
   imgFrame.className = 'imgFrame';
   const img = document.createElement('img');
   imgFrame.appendChild(img);
   img.src = 'upload/' + key;
   this.addFileOptions_(key, value, imgFrame, 200);
   this.gallery_.appendChild(imgFrame);
  }
 }

 previewFile_(dataURL) {
  const imgFrame = document.createElement('div');
  imgFrame.className = 'imgFrame';
  if (typeof dataURL === 'string') imgFrame.classList.add('other');
  else {
   const img = document.createElement('img');
   imgFrame.appendChild(img);
   img.src = URL.createObjectURL(dataURL);
   img.onload = () => URL.revokeObjectURL(img.src);
  }
  this.gallery_.appendChild(imgFrame);
  return imgFrame;
 }

 updateProgress_(fileNumber, percent) {
  this.uploadProgress_[fileNumber] = percent;
  const total = this.uploadProgress_.reduce((tot, curr) => tot + curr, 0) / this.uploadProgress_.length;
  this.progressBar_.value = total;
  if (total === 100) this.hideProgress_();
 }

 process_(file) {
  if (!this.input_.multiple && this.files_.size > 0) {
   if (this.newFiles_.size) emit('del', [...this.newFiles_]);
   this.reset();
  }
  const extension = file.name.split('.').pop().toLowerCase();
  if (!validFile(file.size, extension)) return;
  this.showProgress_();
  const reader = new FileReader();
  reader.readAsArrayBuffer(file);
  reader.onload = async (e) => {
   const md5Name = md5(e.target.result) + '.' + extension;
   const url = file.type.split('/')[0] === 'image' ? new Blob([reader.result], { type: file.type }) : file.type.split('/')[1] || extension;
   if (typeof this.beforeUpload_ === 'function') {
    const continuam = await this.beforeUpload_(md5Name);
    if (!continuam) return;
   }
   this.upload_(file, md5Name, this.previewFile_(url));
   this.processAB_?.(e.target.result, md5Name, file.name);
  };
 }

 addFileOptions_(md5Name, fileName, frameEl, status) {
  if (this.files_.has(md5Name)) {
   frameEl.remove();
   document.dispatchEvent(new CustomEvent('NOTIFY', { detail: ['Acest fisier este deja atasat', 'warning'] }));
  } else {
   frameEl.setAttribute('data-md5', md5Name);
   frameEl.setAttribute('data-name', fileName.replace(/[\W_]+/g, ' '));
   frameEl.setAttribute('data-status', status);
   const closeEl = document.createElement('span');
   closeEl.className = 'del';
   frameEl.appendChild(closeEl);
   this.files_.set(md5Name, fileName);
   if (status === 201) this.newFiles_.add(md5Name);
  }
 }

 upload_(file, md5Name, frameEl) {
  const i = this.uploadProgress_.length;
  this.uploadProgress_.push(0);
  const xhr = new XMLHttpRequest();
  const formData = new FormData();
  xhr.open('POST', '/upload', true);
  xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
  xhr.upload.addEventListener('progress', (e) => this.updateProgress_(i, (e.loaded * 100.0) / e.total || 100));
  xhr.addEventListener('readystatechange', () => {
   if (xhr.readyState === 4 && (xhr.status === 200 || xhr.status === 201)) this.addFileOptions_(md5Name, file.name, frameEl, xhr.status);
   else if (xhr.readyState === 4) frameEl.remove();
   this.updateProgress_(i, 100);
  });
  formData.append('file', file);
  xhr.setRequestHeader('X-Name', md5Name);
  xhr.send(formData);
 }

 reset() {
  this.files_.clear();
  this.newFiles_.clear();
  this.gallery_.textContent = '';
  this.uploadProgress_ = [];
  this.form_.reset();
  this.input_.value = null;
 }

 destroy() {
  if (this.newFiles_.size) emit('del', [...this.newFiles_]);
  rem(this.uploadId_);
  this.tip_?.destroy();
  this.el_ = null;
  this.form_ = null;
  this.input_ = null;
  this.progressBar_ = null;
  this.gallery_ = null;
  this.uploadProgress_ = null;
 }
}
