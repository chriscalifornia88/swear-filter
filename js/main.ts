declare var swearWords;

module Swear {
    export class App {
        private static swearListPath: string = 'words.txt';

        private fileSelector: FileSelector;
        private filter: Filter;
        private subtitles: Subtitles;

        private videoUrl: string = null;
        private subtitleUrl: string = null;

        constructor() {
            console.log('parsing swear word list');
            this.filter = new Filter();
            this.fileSelector = new FileSelector(this.init, this);
        }

        private init() {
            var reader: FileReader = new FileReader();
            var self = this;
            reader.onload = function () {
                console.log('parsing subtitles');
                self.subtitles = new Subtitles();
                self.subtitles.createFromSrt(reader.result, self.filter);

                console.log('generating download link');
                self.downloadSrt(self.subtitles.getContent());

                console.log('generating ffmpeg mute command');
                self.displayCommand(self.subtitles.timestamps);

            };
            reader.readAsText(this.fileSelector.subtitles);
        }

        private downloadSrt(data: any): void {
            const blob: Blob = new Blob([data], {type: 'text/srt'});
            const fileName: string = 'swear.srt';
            const objectUrl: string = URL.createObjectURL(blob);
            const a: HTMLAnchorElement = document.createElement('a') as HTMLAnchorElement;

            a.href = objectUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();

            document.body.removeChild(a);
            URL.revokeObjectURL(objectUrl);
        }

        private displayCommand(timestamps: any[]): void {
            let command: string = 'ffmpeg -i [INPUT] -af "';

            let volumeChanges: string[] = [];

            for (let i = 0; i < timestamps.length; i++) {
                const timestamp = timestamps[i];
                let start: Timestamp = timestamp['start'];
                let end: Timestamp = timestamp['end'];

                // Mute audio if we are within 1 second of the timestamp
                volumeChanges.push("volume=enable='between(t," + start.time + "," + (end.time + 1) + ")':volume=0");
            }
            command += volumeChanges.join(',') + '" -vf subtitles=[SWEAR-SRT] [OUTPUT]';

            document.getElementById("command-results").style.display = "block";
            const t: HTMLTextAreaElement = document.getElementById('command') as HTMLTextAreaElement;
            t.innerText = command;
        }
    }

    export class Filter {
        private list: Array<string> = [];

        constructor() {
            this.list = swearWords;
        }

        public removeSwearWords(content: string) {
            for (var i = 0; i < this.list.length; i++) {
                var word = this.list[i];
                var censored = word.replace(/./g, '*');

                content = content.replace(new RegExp('\\b' + word + '\\b', 'gi'), censored);
            }

            return content;
        }
    }

    export class SwearListReadException {
        public name: string;
        public message: string;

        constructor(filePath) {
            this.name = 'SwearListReadException';
            this.message = "Failed to read the swear list: '" + filePath + "'";
        }
    }

    SwearListReadException.prototype = Error.prototype;

    export class Subtitles {
        private _timestamps = [];
        private _content: string = '';
        private _subtitleCount: number = 1;

        public getContent() {
            return this._content;
        }

        public createFromSrt(content: string, filter: Filter) {
            var result: Array<string> = [];
            var timestamps = [];

            var rows: Array<string> = content.split('\n');

            var formattedTimestamp: string = "";
            var start: Timestamp = null;
            var end: Timestamp = null;
            var subtitle: Array<string> = [];
            var lastSubtitleSwore: Boolean = false;
            var previousSubtitle: Array<string> = [];
            for (var i = 0; i < rows.length; i++) {
                var row: string = rows[i];

                if (row.match(/(.*):(.*):(.*),(.*) --> (.*):(.*):(.*),(.*)/g) !== null) {
                    formattedTimestamp = row.replace(/,/g, '.');
                    var parts = row.split(' --> ');
                    start = new Timestamp(parts[0]);
                    end = new Timestamp(parts[1]);
                } else if (row.trim() == '' && subtitle.length > 0) { // Empty row
                    // Filter out swearing
                    var completeSubtitle: string = subtitle.join("\n");
                    var cleanSubtitle: string = filter.removeSwearWords(completeSubtitle);

                    // Only add subtitles which contained swearing
                    if (cleanSubtitle !== completeSubtitle) {
                        // Add the previous subtitle in case that line gets muted early
                        if (previousSubtitle.length === 4) {
                            result.push(String(this._subtitleCount++));
                            result.push(previousSubtitle[1]);
                            result.push(previousSubtitle[2]);
                            result.push(previousSubtitle[3]);
                        }

                        timestamps.push({'start': start, 'end': end, 'content': cleanSubtitle});
                        result.push(String(this._subtitleCount++));
                        result.push(formattedTimestamp);
                        result.push(cleanSubtitle);
                        result.push("");
                        lastSubtitleSwore = true;
                        previousSubtitle = [];
                    } else {
                        if (lastSubtitleSwore) {
                            // Add next subtitle in case this line is still muted
                            result.push(String(this._subtitleCount++));
                            result.push(formattedTimestamp);
                            result.push(cleanSubtitle);
                            result.push("");
                        }

                        previousSubtitle = [];
                        previousSubtitle.push("");
                        previousSubtitle.push(formattedTimestamp);
                        previousSubtitle.push(cleanSubtitle);
                        previousSubtitle.push("");

                        lastSubtitleSwore = false;
                    }

                    formattedTimestamp = '';
                    start = null;
                    end = null;
                    subtitle = [];
                } else if (start !== null && end !== null) {
                    subtitle.push(row);
                }
            }

            this._timestamps = timestamps;
            this._content = result.join("\n");
            console.log(this._timestamps.length + " swear words filtered");
        }

        get content(): string {
            return this._content;
        }

        get timestamps() {
            return this._timestamps;
        }
    }

    export class FileSelector {
        public static allowedVideoExtensions: Array<string> = ['mp4', 'mkv'];
        public static allowedSubtitleExtensions: Array<string> = ['srt'];

        private scope;

        private initCallback() {
        }

        private _video: File = null;
        private _subtitles: File = null;

        constructor(initCallback, scope) {
            this.scope = scope;
            this.initCallback = initCallback;

            var dropZone = document.getElementById('drop-zone');
            dropZone.addEventListener('dragover', this.handleDragOver);
            var self = this;
            dropZone.addEventListener('drop', function (event: DragEvent) {
                self.handleFileSelect.call(self, event);
            });
        }

        private handleDragOver(event: DragEvent) {
            event.stopPropagation();
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
        }

        private handleFileSelect(event: DragEvent) {
            event.stopPropagation();
            event.preventDefault();

            var files: FileList = event.dataTransfer.files;

            for (var i = 0; i < files.length; i++) {
                var file: File = files[i];

                var extension: string = file.name.split('.').pop().toLowerCase();

                if (FileSelector.allowedVideoExtensions.indexOf(extension) >= 0) {
                    this._video = file;
                    // todo: upload
                } else if (FileSelector.allowedSubtitleExtensions.indexOf(extension) >= 0) {
                    this._subtitles = file;
                    // todo: upload
                }
            }

            if (this._subtitles != null) {
                document.getElementById('file-subtitles').innerHTML = this._subtitles.name;
            }

            if (this._subtitles != null) {
                document.getElementById('start-button').className = document.getElementById('start-button').className.replace(' disabled', '');
                var self = this;
                document.getElementById('start-button').addEventListener('click', function () {
                    self.initCallback.call(self.scope);
                })
            }
        }

        get video(): File {
            return this._video;
        }

        get subtitles(): File {
            return this._subtitles;
        }
    }

    export class Timestamp {
        private _hours: number = 0;
        private _minutes: number = 0;
        private _seconds: number = 0;

        // Timestamp in seconds
        private _time: number = 0;

        constructor(timestamp: string) {
            var parts: Array<string> = timestamp.split(':');
            if (parts.length != 3) {
                throw new InvalidTimestampException(timestamp);
            }

            this._hours = parseInt(parts[0]);
            this._minutes = parseInt(parts[1]);
            this._seconds = parseFloat(parts[2]);

            this._time = ((this._hours * 60) * 60) + (this._minutes * 60) + this._seconds;
        }

        get hours(): number {
            return this._hours;
        }

        get minutes(): number {
            return this._minutes;
        }

        get seconds(): number {
            return this._seconds;
        }

        get time(): number {
            return this._time;
        }
    }

    export class InvalidTimestampException {
        public name: string;
        public message: string;

        constructor(timestamp) {
            this.name = 'InvalidTimestampException';
            this.message = "Invalid subtitle timestamp: '" + timestamp + "'";
        }
    }

    InvalidTimestampException.prototype = Error.prototype;
}

var swearApp = new Swear.App();
